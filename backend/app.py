import cv2
import json
import math
import random
import os
import subprocess
import numpy as np
from ultralytics import YOLO
from flask import Flask, send_file, jsonify, request
from flask_cors import CORS
import time
import imageio_ffmpeg
import uuid
import threading
import base64

# ── Flask alkalmazás ──
app = Flask(__name__)
CORS(app)

is_generating = False
jobs = {}  # Itt tároljuk a folyamatban lévő és kész munkákat


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


def load_videos_config():
    """Betölti a videók konfigurációját (elérési út + doboz koordináták)."""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "videos_config.json")
    videos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos")
    with open(config_path, encoding="utf-8") as f:
        cfg = json.load(f)
    for v in cfg["videos"]:
        v["path"] = os.path.join(videos_dir, v["filename"])
    return cfg["videos"]


# Ha a configban nincs explicit "roi", a red dobozt ennyivel tágítjuk ki (natív felbontás arányában)
ROI_AUTO_H_PAD_FRAC = 0.15  # vízszintes margó: natív képmagasság ~15%-a
ROI_AUTO_V_PAD_FRAC = 0.08  # függőleges margó: ~8%-a

# Fogadási rendszer paraméterei
HOUSE_EDGE = 0.90           # ennyiszerese a "fair" szorzónak (0.9 = 10% ház-előny)
BET_SECONDS = 15           # a felhasználónak ennyi másodperce van fogadni
DEFAULT_ESTIMATE = 3        # ha a box nincs kalibrálva
DEFAULT_STDDEV = 2


def _norm_cdf(x, mean, std):
    if std <= 0:
        return 1.0 if x >= mean else 0.0
    return 0.5 * (1 + math.erf((x - mean) / (std * math.sqrt(2))))


def compute_buckets(estimate, stddev):
    """Négy vödör a becslés köré: <E-1, E-1..E, =E+1, >E+1.
    A szorzó a vödör valószínűségéből és a ház-előnyből jön."""
    est = round(estimate)
    sd = max(0.5, stddev)

    defs = [
        {"id": "low",   "min": 0,       "max": est - 2,   "label": f"< {est - 1}"},
        {"id": "mid",   "min": est - 1, "max": est,       "label": f"{est - 1}–{est}"},
        {"id": "exact", "min": est + 1, "max": est + 1,   "label": f"= {est + 1}"},
        {"id": "high",  "min": est + 2, "max": 10**9,     "label": f"> {est + 1}"},
    ]

    buckets = []
    for b in defs:
        disabled = b["min"] > b["max"]
        if disabled:
            p = 0.0
            payout = 0.0
        else:
            # Folytonossági korrekcióval (±0.5) számított valószínűség
            lo = b["min"] - 0.5
            hi = b["max"] + 0.5
            p = _norm_cdf(hi, estimate, sd) - _norm_cdf(lo, estimate, sd)
            p = max(p, 0.02)  # padló, nehogy extrém szorzó legyen
            payout = round((1.0 / p) * HOUSE_EDGE, 2)

        buckets.append({
            "id": b["id"],
            "label": b["label"],
            "min": b["min"],
            "max": b["max"],
            "payout": payout,
            "disabled": disabled,
        })
    return buckets


def scale_regions(box, frame_height, target_height=720):
    """A doboz natív koordinátáit átskálázza a kimeneti (720p) felbontásra.
    Ha a 'roi' hiányzik a configból, automatikusan a 'red' doboz köré tágítjuk."""
    scale = target_height / frame_height
    red = [int(c * scale) for c in box["red"]]

    if "roi" in box:
        roi = [int(c * scale) for c in box["roi"]]
    else:
        h_pad = int(frame_height * ROI_AUTO_H_PAD_FRAC)
        v_pad = int(frame_height * ROI_AUTO_V_PAD_FRAC)
        rx1, ry1, rx2, ry2 = box["red"]
        roi_native = [rx1 - h_pad, ry1 - v_pad, rx2 + h_pad, ry2 + v_pad]
        roi = [int(c * scale) for c in roi_native]

    return scale, roi, red


def process_video_task(job_id, start_frame, video_cfg, box, clip_length_sec):
    """Ez a függvény fut a háttérben, és frissíti a job állapotát."""
    global is_generating
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out_videos", f"output_{job_id}.mp4")
    vehicle_count = 0
    count_events = []  # Időbélyegek (másodperc a klip elejétől), amikor egy-egy autót számláltunk

    try:
        # Videó megnyitása
        cap = cv2.VideoCapture(video_cfg["path"])
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

        # Konfigból jövő dobozok skálázása a 720p-s kimenetre
        scale, roi, red = scale_regions(box, height)
        out_w = int(width * scale)
        out_h = 720

        print(f"Videó ({video_cfg['id']}): {fps} FPS, Eredeti: {width}x{height}, Kimenet: {out_w}x{out_h}")
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
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            output_path
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Számláláshoz szükséges beállítások (konfigból, 720p-re skálázva)
        target_classes = [2, 3, 5, 7] # autó, motor, busz, teherautó
        roi_x1, roi_y1, roi_x2, roi_y2 = roi
        piros_doboz_x1, piros_doboz_y1, piros_doboz_x2, piros_doboz_y2 = red

        # Padded crop region: csak ezt a területet kapja a YOLO (gyorsabb inferencia)
        PAD_TOP, PAD_BOTTOM, PAD_LEFT, PAD_RIGHT = 80, 80, 40, 40
        crop_y1 = max(0, roi_y1 - PAD_TOP)
        crop_y2 = min(out_h, roi_y2 + PAD_BOTTOM)
        crop_x1 = max(0, roi_x1 - PAD_LEFT)
        crop_x2 = min(out_w, roi_x2 + PAD_RIGHT)

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
                                      conf=0.3, iou=0.5, imgsz=320, stream=True)

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
                for bbox, track_id in zip(last_boxes, last_ids):
                    x1, y1, x2, y2 = map(int, bbox)

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
                                count_events.append(round(i / fps, 3))

                                cv2.rectangle(frame, (piros_doboz_x1, piros_doboz_y1),
                                              (piros_doboz_x2, piros_doboz_y2), (255, 255, 255), 4)

            # Képkocka mentése az FFmpeg pipe-ba
            ffmpeg_proc.stdin.write(frame.tobytes())

        # Siker esetén frissítjük a Job állapotát
        jobs[job_id]['status'] = 'done'
        jobs[job_id]['output_path'] = output_path
        jobs[job_id]['vehicle_count'] = vehicle_count
        jobs[job_id]['count_events'] = count_events

    except Exception as e:
        print(f"Hiba történt: {e}")
        jobs[job_id]['status'] = 'error'
    finally:
        # Erőforrások felszabadítása
        if 'ffmpeg_proc' in locals():
            ffmpeg_proc.stdin.close()
            ffmpeg_proc.wait()
        if 'cap' in locals(): cap.release()

        print(f"Kocsik száma: {vehicle_count}")
        is_generating = False


# Paraméterek
KIVAGAS_HOSSZA = 20  # másodperc
MODEL = load_model()
VIDEOS = load_videos_config()

# ── ÚJ VÉGPONTOK ──

@app.route('/start', methods=['POST'])
def start_generation():
    """Kezdeményezi a generálást, kiszámolja a kezdőpontot, visszaadja az első frame-et és az ID-t."""
    global is_generating

    if is_generating:
        return jsonify({"error": "A szerver jelenleg egy videót dolgoz fel. Próbáld újra később!"}), 503

    is_generating = True

    try:
        # Videó és doboz véletlenszerű kiválasztása
        video_cfg = random.choice(VIDEOS)
        box = random.choice(video_cfg["boxes"])

        # Becslés a kiválasztott boxhoz (kalibrációból; ha nincs, default)
        estimate = box.get("estimate", DEFAULT_ESTIMATE)
        stddev = box.get("stddev", DEFAULT_STDDEV)
        buckets = compute_buckets(estimate, stddev)

        # Videó megnyitása csak azért, hogy sorsoljunk és kivegyük az első képet
        cap = cv2.VideoCapture(video_cfg["path"])
        if not cap.isOpened():
            is_generating = False
            return jsonify({"error": "Nem sikerült megnyitni a forrásvideót!"}), 500

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frames_to_extract = int(KIVAGAS_HOSSZA * fps)

        extra_frames_buffer = int(2 * fps)
        max_start_frame = total_frames - frames_to_extract - extra_frames_buffer

        if max_start_frame <= 0:
            cap.release()
            is_generating = False
            return jsonify({"error": "A videó túl rövid a kért kivágáshoz!"}), 400

        # Sorsolás
        start_frame = random.randint(0, max_start_frame)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        # Első képkocka beolvasása
        ret, frame = cap.read()
        cap.release()

        if not ret:
            is_generating = False
            return jsonify({"error": "Hiba az első képkocka olvasásakor!"}), 500

        # Kép átméretezése 720p-re, hogy megegyezzen a végleges videóval
        height, width = frame.shape[:2]
        scale, _, red = scale_regions(box, height)
        frame = cv2.resize(frame, (int(width * scale), 720))

        # Piros téglalap rárajzolása a képre (BGR formátumban a piros (0, 0, 255), 2px vastagság)
        cv2.rectangle(frame, (red[0], red[1]), (red[2], red[3]), (0, 0, 255), 2)

        # Kódolás Base64 formátumba a könnyű küldéshez
        _, buffer = cv2.imencode('.jpg', frame)
        frame_b64 = base64.b64encode(buffer).decode('utf-8')

        # Job létrehozása
        job_id = str(uuid.uuid4())
        jobs[job_id] = {
            "status": "processing",
            "start_time": time.time()
        }

        # Háttérszál indítása
        thread = threading.Thread(target=process_video_task,
                                  args=(job_id, start_frame, video_cfg, box, KIVAGAS_HOSSZA))
        thread.daemon = True # A szál leáll, ha a főprogram leáll
        thread.start()

        return jsonify({
            "message": "Feldolgozás elindítva",
            "job_id": job_id,
            "first_frame_base64": frame_b64,
            "estimate": estimate,
            "stddev": stddev,
            "buckets": buckets,
            "bet_seconds": BET_SECONDS,
        }), 200

    except Exception as e:
        is_generating = False
        return jsonify({"error": str(e)}), 500


@app.route('/status/<job_id>', methods=['GET'])
def get_status(job_id):
    """A kliens lekérdezheti, hogy hol tart a folyamat."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Nem található ilyen azonosító"}), 404

    # Ha kész, visszaküldjük a kocsik számát és az időbélyegeket is
    response_data = {"status": job['status']}
    if job['status'] == 'done':
        response_data['vehicle_count'] = job.get('vehicle_count', 0)
        response_data['count_events'] = job.get('count_events', [])

    return jsonify(response_data), 200


@app.route('/video/<job_id>', methods=['GET'])
def get_video(job_id):
    """Kész videó letöltése."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Nem található ilyen azonosító"}), 404

    if job['status'] != 'done':
        return jsonify({"error": "A videó még nincs kész vagy hiba történt."}), 400

    video_path = job.get('output_path')
    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "A videófájl nem található a szerveren."}), 500

    # Itt is benne hagyjuk a fejlécet, de a /status végpontból könnyebb lesz kiolvasni a kliensnek
    response = send_file(video_path, mimetype='video/mp4')
    response.headers['X-Vehicle-Count'] = str(job.get('vehicle_count', 0))
    response.headers['Access-Control-Expose-Headers'] = 'X-Vehicle-Count'
    return response


# Szerver indítása
if __name__ == '__main__':
    # Hozzuk létre az output mappát, ha nincs
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out_videos"), exist_ok=True)
    app.run(port=5000, debug=True)