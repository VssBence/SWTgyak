import cv2
import random
import os
import subprocess
import numpy as np
from ultralytics import YOLO
from flask import Flask, send_file, jsonify
from flask_cors import CORS
import time
import imageio_ffmpeg

# ── Flask alkalmazás ──
app = Flask(__name__)
CORS(app)

is_generating = False


def detect_device():
    """Legjobb elérhető inferencia eszköz detektálása (DirectML > OpenVINO > CPU)."""
    try:
        import torch_directml
        device = torch_directml.device()
        print("DirectML elérhető! AMD GPU gyorsítás aktív.")
        return device, "directml"
    except ImportError:
        pass

    try:
        import openvino  # noqa: F401
        print("OpenVINO elérhető! Intel CPU/GPU gyorsítás aktív.")
        return "cpu", "openvino"
    except ImportError:
        pass

    print("Gyorsítás nem elérhető, CPU módban futunk.")
    return "cpu", "cpu"


def detect_encoder():
    """Legjobb elérhető H.264 hardveres encoder detektálása (AMF > QSV > libx264)."""
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        result = subprocess.run(
            [ffmpeg_exe, '-encoders'], capture_output=True, text=True
        )
        if 'h264_amf' in result.stdout:
            print("AMD AMF encoder detektálva, hardveres kódolás aktív.")
            return 'h264_amf'
        if 'h264_qsv' in result.stdout:
            print("Intel QuickSync encoder detektálva, hardveres kódolás aktív.")
            return 'h264_qsv'
    except Exception:
        pass
    print("Hardveres encoder nem elérhető, libx264 (szoftveres) kódolást használunk.")
    return 'libx264'


def build_ffmpeg_encoder_args(encoder):
    """Encoder-specifikus FFmpeg argumentumok."""
    if encoder == 'h264_amf':
        return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23']
    if encoder == 'h264_qsv':
        return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '23']
    return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23']


def load_model(backend):
    """Modell betöltése a detektált backend alapján (DirectML > OpenVINO > CPU)."""
    openvino_path = "yolov8n_openvino_model"

    if backend == "openvino":
        if os.path.isdir(openvino_path):
            print("OpenVINO modell betöltése (Intel CPU/GPU)...")
            return YOLO(openvino_path)
        print("PyTorch modell betöltése + OpenVINO export...")
        model = YOLO("yolov8n.pt")
        try:
            model.export(format="openvino", imgsz=320, half=False)
            print("OpenVINO export sikeres! Újratöltés...")
            return YOLO(openvino_path)
        except Exception as e:
            print(f"OpenVINO export sikertelen ({e}), CPU PyTorch-ot használunk.")
        return model

    print("PyTorch modell betöltése...")
    return YOLO("yolov8n.pt")


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

        # Vektorizált Metszet osztva Unióval a maradék dobozokkal
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

        # Downscale to 720p
        scale = 720 / height
        out_w = int(width * scale)
        out_h = 720

        print(f"Videó adatai: {fps} FPS, Eredeti: {width}x{height}, Kimenet: {out_w}x{out_h}")
        print(f"Kivágás kezdete: {start_frame}. képkocka (kb. {start_frame/fps:.2f}. másodperc)")

        # Ugrás a kisorsolt kezdő képkockára
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        # FFmpeg pipe: egyetlen menetben H.264 kódolás
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_proc = subprocess.Popen([
            ffmpeg_exe, '-y',
            '-f', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f'{out_w}x{out_h}', '-r', str(fps),
            '-i', 'pipe:0',
            *ENCODER_ARGS,
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            output_path
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Számláláshoz szükséges beállítások (720p-re átszámolva)
        target_classes = [2, 3, 5, 7] # autó, motor, busz, teherautó
        roi_x1, roi_y1 = int(380 * scale), int(170 * scale)
        roi_x2, roi_y2 = int(1130 * scale), int(290 * scale)

        # A piros doboz pontos koordinátái (720p-re átszámolva)
        piros_doboz_x1, piros_doboz_y1 = int(403 * scale), int(191 * scale)
        piros_doboz_x2, piros_doboz_y2 = int(1111 * scale), int(269 * scale)

        # Padded crop region: csak ezt a területet kapja a YOLO (gyorsabb inferencia)
        PAD_TOP, PAD_BOTTOM, PAD_LEFT, PAD_RIGHT = 80, 80, 40, 40
        crop_y1 = max(0, roi_y1 - PAD_TOP)
        crop_y2 = min(out_h, roi_y2 + PAD_BOTTOM)
        crop_x1 = max(0, roi_x1 - PAD_LEFT)
        crop_x2 = min(out_w, roi_x2 + PAD_RIGHT)

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

            # Downscale to 720p
            frame = cv2.resize(frame, (out_w, out_h))

            # Csak minden SKIP_FRAMES-edik képkockán futtatunk detekciót
            if i % SKIP_FRAMES == 0:
                # ROI crop: csak a releváns területet adjuk a YOLO-nak
                cropped = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                results = MODEL.track(cropped, persist=True, classes=target_classes, verbose=False,
                                      conf=0.3, iou=0.5, imgsz=320, stream=True, device=DEVICE)

                result = next(iter(results))
                if result.boxes.id is not None:
                    boxes = result.boxes.xyxy.cpu().numpy()
                    ids = result.boxes.id.cpu().numpy().astype(int)

                    # Crop-lokális koordináták visszaalakítása teljes frame-re
                    boxes[:, 0] += crop_x1
                    boxes[:, 1] += crop_y1
                    boxes[:, 2] += crop_x1
                    boxes[:, 3] += crop_y1

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

                    # Középpont kiszámítása
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2

                    # Ellenőrizzük, hogy a jármű közepe a megfigyelt területen belül van-e
                    if roi_x1 < cx < roi_x2 and y2 > roi_y1 and y1 < roi_y2:

                        # Zöld doboz rajzolása
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

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

            # A végső eredmény kiírása
            cv2.putText(frame, f"Athaladt jarmuvek: {vehicle_count}", (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 3)

            # Képkocka mentése az FFmpeg pipe-ba
            ffmpeg_proc.stdin.write(frame.tobytes())

    except Exception as e:
        print(f"Hiba történt: {e}")
        return None
    finally:
        # Erőforrások felszabadítása
        if 'ffmpeg_proc' in locals():
            ffmpeg_proc.stdin.close()
            ffmpeg_proc.wait()
        if 'cap' in locals(): cap.release()
    print(f"Kocsik száma: {vehicle_count}")

    return output_path, vehicle_count


#Paraméterek
BEMENETI_VIDEO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos", "test4_11min.mp4")
KIVAGAS_HOSSZA = 20  # másodperc
DEVICE, BACKEND = detect_device()
ENCODER = detect_encoder()
ENCODER_ARGS = build_ffmpeg_encoder_args(ENCODER)
MODEL = load_model(BACKEND)


#Flask végpont
@app.route('/generate', methods=['POST'])
def generate():
    """Videó generálása és visszaküldése a kliensnek."""
    global is_generating

    if is_generating:
        return jsonify({"error": "A szerver jelenleg egy videót dolgoz fel. Próbáld újra később!"}), 503

    is_generating = True
    try:
        result = main(BEMENETI_VIDEO, KIVAGAS_HOSSZA)

        if result is None:
            return jsonify({"error": "Hiba a videó feldolgozása közben"}), 500

        result_path, vehicle_count = result
        response = send_file(result_path, mimetype='video/mp4')
        response.headers['X-Vehicle-Count'] = str(vehicle_count)
        response.headers['Access-Control-Expose-Headers'] = 'X-Vehicle-Count'
        return response
    finally:
        is_generating = False


#Szerver indítása
if __name__ == '__main__':
    app.run(port=5000, debug=True)
