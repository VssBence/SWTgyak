import cv2
import random
import os
from ultralytics import YOLO
import time

def main(input_path, clip_length_sec):
    try:
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

        # Kiszámoljuk, hány képkockát jelent a kért másodperc
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

        # Képkockák beolvasása és kiírása
        for i in range(frames_to_extract):
            frame_start_time = time.time()
            ret, frame = cap.read()
            if not ret:
                print("Figyelmeztetés: A vártnál hamarabb véget ért a videó.")
                break
            if i % 6 == 0:
                boxes_to_draw = []
                results = model(frame, verbose=False,conf=0.3)
                for box in results[0].boxes:
                    cls = int(box.cls[0])
                    label = model.names[cls]
                    if label in ("car","truck","bus","motorcycle"):
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        conf = float(box.conf[0])
                        boxes_to_draw.append((x1, y1, x2, y2, label, conf))
                    
            for (x1, y1, x2, y2, label, conf) in boxes_to_draw:
                cv2.rectangle(frame,(x1,y1),(x2,y2), (0,255,0),2)
            cv2.imshow("Clip",frame)
            
            elapsed_time = time.time() - frame_start_time
            delay = max(1, int((1/fps - elapsed_time) * 1000))
            
            if cv2.waitKey(delay) & 0xFF == 27: #ESCAPE a kilépéshez
                break;
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