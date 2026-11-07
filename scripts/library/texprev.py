"""Превью текстуры 1024 px с сеткой 10×10 (жёлтые линии) — чтобы указывать области в долях."""
import sys, cv2
im = cv2.imread(sys.argv[1]); h, w = im.shape[:2]; k = 1024 / max(h, w)
im = cv2.resize(im, (int(w * k), int(h * k))); H, W = im.shape[:2]
if len(sys.argv) < 4:
    for i in range(1, 10):
        cv2.line(im, (int(i * W / 10), 0), (int(i * W / 10), H), (0, 255, 255), 1)
        cv2.line(im, (0, int(i * H / 10)), (W, int(i * H / 10)), (0, 255, 255), 1)
cv2.imwrite(sys.argv[2], im, [cv2.IMWRITE_JPEG_QUALITY, 85])
