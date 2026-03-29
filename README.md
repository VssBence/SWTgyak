## Beállítás

Töltsd le a videó fájlokat: [Google Drive link](https://drive.google.com/drive/folders/1iAsKVVwKsTyVU_OQHdICq-TcCrtRfNbE?usp=sharing)

Majd helyezd be a `videos/` mappába.

Ezeket a fájlokat nem tartalmazza a repo, mivel túl nagyok.

## Függőségek telepítése
```bash
pip install opencv-python ultralytics flask flask-cors imageio-ffmpeg openvino
```
**AMD GPU esetén:**
```bash
pip install torch-directml
```

## Szerver elindítása

```bash
python backend/app.py
```
