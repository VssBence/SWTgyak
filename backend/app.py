import cv2
import random
import os
import numpy as np
from ultralytics import YOLO
from flask import Flask, send_file, jsonify
from flask_cors import CORS
import time

# ── Flask alkalmazás ──
app = Flask(__name__)
CORS(app)


def load_model():
    """Modell betöltése a legjobb elérhető backend-del (OpenVINO > DirectML > CPU)."""
    openvino_path = "yolov8n_openvino_model"
    if os.path.isdir(openvino_path):
        print("OpenVINO modell betöltése (Intel CPU/GPU)...")
        return YOLO(openvino_path)

    print("PyTorch modell betöltése...")
    model = YOLO("yolov8n.pt")

    # OpenVINO export próba (Intel CPU/Xe GPU-hoz a legjobb)
    try:
        model.export(format="openvino", imgsz=320, half=False)
        print("OpenVINO export sikeres! Újratöltés...")
        return YOLO(openvino_path)
    except Exception as e:
        print(f"OpenVINO nem elérhető ({e}), PyTorch-ot használunk.")

    return model


def suppress_duplicate_boxes(boxes, ids, iou_threshold=0.3):
    """Közeli/átfedő dobozok összevonása, hogy egy járműhöz csak 1 doboz tartozzon (vektorizált)."""
    if len(boxes) <= 1:
        return boxes, ids

    # Területek előre kiszámolva
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])

    keep = []
    suppressed = np.zeros(len(boxes), dtype=bool)

    for i in range(len(boxes)):
        if suppressed[i]:
            continue
        keep.append(i)

        # Vektorizált IoU a maradék dobozokkal
        remaining = np.where(~suppressed)[0]
        remaining = remaining[remaining > i]
        if len(remaining) == 0:
            continue

        xi1 = np.maximum(boxes[i, 0], boxes[remaining, 0])
        yi1 = np.maximum(boxes[i, 1], boxes[remaining, 1])
        xi2 = np.minimum(boxes[i, 2], boxes[remaining, 2])
        yi2 = np.minimum(boxes[i, 3], boxes[remaining, 3])
        inter = np.maximum(0, xi2 - xi1) * np.maximum(0, yi2 - yi1)
        union = areas[i] + areas[remaining] - inter
        iou = np.where(union > 0, inter / union, 0)

        suppressed[remaining[iou > iou_threshold]] = True

    return boxes[keep], ids[keep]


def main(input_path, clip_length_sec):
    """Videó feldolgozása: véletlenszerű kivágás + jármű számlálás. Visszaadja a kimeneti fájl útvonalát."""
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out_videos", f"output{int(time.time())}.mp4")
    try:
        model = load_model()

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

        # Kimeneti videó beállítása
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        # Számláláshoz szükséges beállítások
        target_classes = [2, 3, 5, 7] # autó, motor, busz, teherautó
        roi_x1, roi_y1 = 380, 170
        roi_x2, roi_y2 = 1130, 290


        # A piros doboz pontos koordinátái
        piros_doboz_x1, piros_doboz_y1 = 403, 191
        piros_doboz_x2, piros_doboz_y2 = 1111, 269

        vehicle_count = 0
        vehicle_states = {} # Tárolja a járművek állapotát: 'inside' vagy 'counted'

        # Csak minden N-edik képkockán futtatunk detekciót (a többi frame-re újrahasználjuk)
        SKIP_FRAMES = 2
        last_boxes = None
        last_ids = None

        # Képkockák beolvasása és kiírása
        for i in range(frames_to_extract):

            ret, frame = cap.read()
            if not ret:
                print("Figyelmeztetés: A vártnál hamarabb véget ért a videó.")
                break

            # Csak minden SKIP_FRAMES-edik képkockán futtatunk detekciót
            if i % SKIP_FRAMES == 0:
                results = model.track(frame, persist=True, classes=target_classes, verbose=False,
                                      conf=0.3, iou=0.5, imgsz=320, stream=True)

                result = next(iter(results))
                if result.boxes.id is not None:
                    boxes = result.boxes.xyxy.cpu().numpy()
                    ids = result.boxes.id.cpu().numpy().astype(int)

                    # Előszűrés: csak a ROI közelében lévő dobozok (gyorsabb NMS)
                    roi_mask = (boxes[:, 2] > roi_x1) & (boxes[:, 0] < roi_x2) & \
                               (boxes[:, 3] > roi_y1) & (boxes[:, 1] < roi_y2)
                    boxes, ids = boxes[roi_mask], ids[roi_mask]

                    # Dupla dobozok szűrése
                    last_boxes, last_ids = suppress_duplicate_boxes(boxes, ids)
                else:
                    last_boxes = None
                    last_ids = None

            # PIROS DOBOZ rajzolása
            cv2.rectangle(frame, (piros_doboz_x1, piros_doboz_y1), (piros_doboz_x2, piros_doboz_y2), (0, 0, 255), 2)

            # Eredmények feldolgozása (utolsó detekció eredményeit használjuk)
            if last_boxes is not None and last_ids is not None:
                for box, track_id in zip(last_boxes, last_ids):
                    x1, y1, x2, y2 = map(int, box)

                    # Középpont (centroid) kiszámítása
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2

                    # Ellenőrizzük, hogy a jármű közepe a megfigyelt területen (ROI) belül van-e
                    if roi_x1 < cx < roi_x2 and y2 > roi_y1 and y1 < roi_y2:

                        # Zöld doboz, középpont és ID rajzolása
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.circle(frame, (cx, cy), 4, (0, 255, 0), -1)
                        cv2.putText(frame, f"ID: {track_id}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                        # Számláló logika: Belépés és kilépés figyelése
                        in_red_box = (piros_doboz_x1 <= cx <= piros_doboz_x2) and (piros_doboz_y1 <= cy <= piros_doboz_y2)

                        if in_red_box:
                            if vehicle_states.get(track_id) != 'counted':
                                vehicle_states[track_id] = 'inside'
                        else:
                            if vehicle_states.get(track_id) == 'inside':
                                vehicle_count += 1
                                vehicle_states[track_id] = 'counted'

                                cv2.rectangle(frame, (piros_doboz_x1, piros_doboz_y1),
                                              (piros_doboz_x2, piros_doboz_y2), (255, 255, 255), 4)

            # A végső számláló kiírása
            cv2.putText(frame, f"Athaladt jarmuvek: {vehicle_count}", (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 3)

            # Képkocka mentése a kimeneti videóba
            out.write(frame)

    except Exception as e:
        print(f"Hiba történt: {e}")
        return None
    finally:
        # Erőforrások felszabadítása
        if 'out' in locals(): out.release()
        if 'cap' in locals(): cap.release()

    return output_path


# ── Paraméterek ──
BEMENETI_VIDEO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos", "test4_11min.mp4")
KIVAGAS_HOSSZA = 20  # másodperc


# ── Flask végpont ──
@app.route('/generate', methods=['POST'])
def generate():
    """Videó generálása és visszaküldése a kliensnek."""
    result_path = main(BEMENETI_VIDEO, KIVAGAS_HOSSZA)

    if result_path is None:
        return jsonify({"error": "Hiba a videó feldolgozása közben"}), 500

    return send_file(result_path, mimetype='video/mp4')


# ── Szerver indítása ──
if __name__ == '__main__':
    app.run(port=5000, debug=True)
