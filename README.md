# RushHour CCTV

Forgalomszámláló fogadójáték. A rendszer CCTV felvételekből véletlenszerű klipeket vág ki, YOLOv8-cal valós időben számolja az áthaladó járműveket, a felhasználó pedig fogadhat az eredményre.

## Hogyan működik?

1. Az **Indítás** gombra kattintva a szerver véletlenszerűen kiválaszt egy kameraállást és egy időszakot
2. Megjelenik az első képkocka, és a játékos **15 másodpercet** kap fogadásra
3. A fogadás 4 sávra osztott (kevesebb / közepes / pontos / több), mindegyikhez a valószínűségből számolt szorzó tartozik
4. A háttérben a szerver feldolgozza a videórészletet (YOLO tracking + számlálás), majd visszaküldi a kész videót
5. Lejátszás közben élőben látszik a számláló, végén kiértékelődik a fogadás

## Előfeltételek

- **Python 3.10+** — [letöltés](https://www.python.org/downloads/)
  - Telepítéskor: **"Add Python to PATH"** legyen bepipálva!

## Telepítés

### 1. Videófájlok letöltése

Töltsd le a videó fájlokat: [Google Drive link](https://drive.google.com/drive/folders/1iAsKVVwKsTyVU_OQHdICq-TcCrtRfNbE?usp=sharing)

Majd helyezd be a `videos/` mappába. Ezeket a fájlokat nem tartalmazza a repo, mivel túl nagyok.

| Fájlnév | Leírás |
|---|---|
| `test1_5min.mp4` | ~5 perces felvétel |
| `test2_14min.mp4` | ~14 perces felvétel |
| `test3_34min.mp4` | ~34 perces felvétel |
| `test4_11min.mp4` | ~11 perces felvétel |

### 2. Függőségek telepítése

Futtasd az `install.bat` fájlt (dupla klikk). Ez automatikusan:
- Létrehozza a Python virtuális környezetet (`.venv`)
- Telepíti az összes szükséges csomagot (`flask`, `opencv-python`, `ultralytics`, stb.)
- Létrehozza az `out_videos/` kimeneti mappát

### Manuális telepítés (ha a .bat nem működne)

```
python -m venv .venv
.venv\Scripts\activate
pip install flask flask-cors opencv-python numpy ultralytics imageio-ffmpeg
```

## Indítás

Futtasd a `start.bat` fájlt, majd nyisd meg a `frontend/index.html` fájlt böngészőben.

A backend a `http://localhost:5000` címen fut.

### Manuális indítás

```
.venv\Scripts\activate
cd backend
python app.py
```

## Mappaszerkezet

```
.
├── backend/
│   ├── app.py                 # Flask szerver + YOLO feldolgozás
│   ├── videos_config.json     # Kameraállások és doboz-koordináták
│   └── yolov8n.pt             # YOLOv8 nano modell
├── frontend/
│   ├── index.html             # Játék UI
│   ├── app.js                 # Kliens logika
│   └── style.css              # Stílusok
├── videos/                    # CCTV felvételek (nem commitolt)
├── out_videos/                # Generált kimeneti videók
├── install.bat                # Automatikus telepítő
├── start.bat                  # Szerver indító
└── README.md
```

## API végpontok

| Végpont | Metódus | Leírás |
|---|---|---|
| `/start` | POST | Új kör indítása — visszaad egy előnézeti képet, fogadási sávokat, és egy `job_id`-t |
| `/status/<job_id>` | GET | Feldolgozás állapota, kész állapotban a végeredményt is |
| `/video/<job_id>` | GET | Kész videó letöltése |
