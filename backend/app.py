import cv2
import random
import os

def create_random_clip_opencv(input_path, output_path, clip_length_sec):
    try:
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
        max_start_frame = total_frames - frames_to_extract
        start_frame = random.randint(0, max_start_frame)

        print(f"Videó adatai: {fps} FPS, Felbontás: {width}x{height}")
        print(f"Kivágás kezdete: {start_frame}. képkocka (kb. {start_frame/fps:.2f}. másodperc)")

        # Videóíró inicializálása (MP4 formátumhoz)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v') 
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        # Ugrás a kisorsolt kezdő képkockára
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        # Képkockák beolvasása és kiírása
        print("Kivágás és mentés folyamatban (ez OpenCV-vel eltarthat egy ideig)...")
        for i in range(frames_to_extract):
            ret, frame = cap.read()
            if not ret:
                print("Figyelmeztetés: A vártnál hamarabb véget ért a videó.")
                break
            out.write(frame)

        print(f"Sikeresen elmentve (hang nélkül): {output_path}")

    except Exception as e:
        print(f"Hiba történt: {e}")
    finally:
        # Erőforrások felszabadítása
        if 'cap' in locals(): cap.release()
        if 'out' in locals(): out.release()

# Paraméterek
BEMENETI_VIDEO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos", "test1_5min.mp4")
KIMENETI_VIDEO = "veletlen_reszlet_opencv.mp4"
KIVAGAS_HOSSZA = 20 # másodperc

create_random_clip_opencv(BEMENETI_VIDEO, KIMENETI_VIDEO, KIVAGAS_HOSSZA)