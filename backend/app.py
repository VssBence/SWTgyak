import cv2
import random
import os
from ultralytics import YOLO
import time

def main(input_path, clip_length_sec):
    try:
        # Modell betöltése
        model = YOLO("yolov8s.pt")
        
        # Videó megnyitása
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            print("Hiba: Nem sikerült megnyitni a videót!")
            return

        # Videó tulajdonságainak lekérdezése
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Átalakítjuk, hány képkockát jelent a kért másodperc
        frames_to_extract = int(clip_length_sec * fps)

        if total_frames <= frames_to_extract:
            print("Hiba: A videó rövidebb, mint a kivágni kívánt részlet!")
            cap.release()
            return

        # Véletlenszerű kezdő képkocka sorsolása
        extra_frames_buffer = int(2 * fps)
        max_start_frame = total_frames - frames_to_extract - extra_frames_buffer
        start_frame = random.randint(0, max_start_frame)

        print(f"Videó adatai: {fps} FPS, Felbontás: {width}x{height}")
        print(f"Kivágás kezdete: {start_frame}. képkocka (kb. {start_frame/fps:.2f}. másodperc)")

        # Ugrás a kisorsolt kezdő képkockára
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        # Számláláshoz szükséges beállítások
        target_classes = [2, 3, 5, 7] # autó, motor, busz, teherautó
        roi_x1, roi_y1 = 380, 170
        roi_x2, roi_y2 = 1130, 290
        
        
        # A piros doboz pontos koordinátái
        piros_doboz_x1, piros_doboz_y1 = 403, 191
        piros_doboz_x2, piros_doboz_y2 = 1111, 269
        
        vehicle_count = 0
        vehicle_states = {} # Tárolja a járművek állapotát: 'inside' vagy 'counted'

        # Képkockák beolvasása és kiírása
        for i in range(frames_to_extract):
            
            frame_start_time = time.time()
            ret, frame = cap.read()
            if not ret:
                print("Figyelmeztetés: A vártnál hamarabb véget ért a videó.")
                break
            
            # Objektumkövetés (track) a képkockán
            results = model.track(frame, persist=True, classes=target_classes, verbose=False, conf=0.3)
            
            # PIROS DOBOZ és belső számláló vonal rajzolása
            cv2.rectangle(frame, (piros_doboz_x1, piros_doboz_y1), (piros_doboz_x2, piros_doboz_y2), (0, 0, 255), 2)

            # Eredmények feldolgozása, ha talált járművet azonosítóval
            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                ids = results[0].boxes.id.cpu().numpy().astype(int)

                for box, id in zip(boxes, ids):
                    x1, y1, x2, y2 = map(int, box)
                    
                    # Középpont (centroid) kiszámítása
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2

                    # Ellenőrizzük, hogy a jármű közepe a megfigyelt területen (ROI) belül van-e
                    if roi_x1 < cx < roi_x2 and y2 > roi_y1 and y1 < roi_y2:
                        
                        # Zöld doboz, középpont és ID rajzolása
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.circle(frame, (cx, cy), 4, (0, 255, 0), -1)
                        cv2.putText(frame, f"ID: {id}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                        # Számláló logika: Belépés és kilépés figyelése
                        # Megnézzük, hogy a jármű középpontja a dobozban van-e
                        in_red_box = (piros_doboz_x1 <= cx <= piros_doboz_x2) and (piros_doboz_y1 <= cy <= piros_doboz_y2)

                        if in_red_box:
                            # Ha a jármű a dobozban van, és még nem lett megszámolva, megjelöljük, hogy "bent van"
                            if vehicle_states.get(id) != 'counted':
                                vehicle_states[id] = 'inside'
                        else:
                            # Ha a jármű nincs a dobozban, de korábban bent volt -> most lépett ki!
                            if vehicle_states.get(id) == 'inside':
                                vehicle_count += 1
                                vehicle_states[id] = 'counted' # Átállítjuk az állapotát, hogy ne számoljuk újra
                                
                                # Vizuális visszajelzés: villanjon fel fehérrel a doboz, amikor kilép és számolunk
                                cv2.rectangle(frame, (piros_doboz_x1, piros_doboz_y1), 
                                              (piros_doboz_x2, piros_doboz_y2), (255, 255, 255), 4)

            # A végső számláló kiírása
            cv2.putText(frame, f"Athaladt jarmuvek: {vehicle_count}", (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 3)

            # Képernyőre rajzolás
            cv2.imshow("Clip", frame)
            
            # Képkocka sebesség (FPS) tartása
            elapsed_time = time.time() - frame_start_time
            delay = max(1, int((1/fps - elapsed_time) * 1000))
            
            if cv2.waitKey(delay) & 0xFF == 27: # ESCAPE a kilépéshez
                break

        cv2.destroyAllWindows()

    except Exception as e:
        print(f"Hiba történt: {e}")
    finally:
        # Erőforrások felszabadítása
        if 'cap' in locals(): cap.release()

# Paraméterek
BEMENETI_VIDEO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos", "test4_11min.mp4")
KIVAGAS_HOSSZA = 20 # másodperc

main(BEMENETI_VIDEO, KIVAGAS_HOSSZA)