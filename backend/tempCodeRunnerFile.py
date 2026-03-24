import cv2
import os

#Ebben a programban grafikusan kiválasztható egy téglalap a videó egy képkockáján,
# majd a koordinátákat kiírja a konzolra, valamint egy másolható sort is, 
# amit beillesztve megjeleníthető a téglalap a videóban.

def select_roi(input_path):
    cap = cv2.VideoCapture(input_path)
    ret, frame = cap.read()
    cap.release()

    print("Húzz egy téglalapot az egérrel, majd nyomj ENTER-t vagy SPACE-t a megerősítéshez.")
    print("C gomb: mégse")

    roi = cv2.selectROI("Select ROI", frame, fromCenter=False, showCrosshair=True)
    cv2.destroyAllWindows()

    x, y, w, h = roi
    print(f"\nKoordináták: pt1=({x}, {y}), pt2=({x + w}, {y + h})")
    print(f"\nMásolható sor:")
    print(f'cv2.rectangle(frame, ({x}, {y}), ({x + w}, {y + h}), (0, 0, 255), 2)')

VIDEO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos", "test4_11min.mp4")
select_roi(VIDEO_PATH)