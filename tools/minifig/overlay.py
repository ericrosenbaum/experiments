# Overlay the minifig silhouettes rendered by review.mjs (red) on the patent
# drawings (US D253,711, public domain), aligned at the feet and centerline.
# Get the drawing from Wikimedia Commons, File:USD253711-1.png (960x1146), then:
#   python3 tools/minifig/overlay.py <review outdir> <path to USD253711-1.png>
# Needs Pillow and numpy. Writes <outdir>/overlay.png (front | side) and prints
# how far out the arms reach, row by row, in studs, for the patent and the render.
import sys
from PIL import Image
import numpy as np
d = sys.argv[1]
pat = Image.open(sys.argv[2]).convert('L')
MARGIN = 10
def one(render, feet_y, center_x):
    r = Image.open(f'{d}/{render}.png').convert('RGB')
    w, h = r.size
    x0, y0 = int(round(center_x - w / 2)), int(round(feet_y - (h - MARGIN)))
    p = np.array(pat.crop((x0, y0, x0 + w, y0 + h))).astype(float)
    a = np.array(r).astype(float)
    sil = (a[..., 0] > 150) & (a[..., 1] < 120)
    outimg = np.stack([p, p, p], -1)
    ink = p < 128
    outimg[sil] = outimg[sil] * 0.45 + np.array([255, 60, 60]) * 0.55
    outimg[ink] = [0, 0, 0]
    # where the patent has ink outside my silhouette: blue (I'm too small there)
    return Image.fromarray(outimg.astype(np.uint8)), sil, ink
f, fs, fi = one('front', 562, 243.5)
s, ss, si = one('side', 752, 487)
W = f.width + s.width + 20
img = Image.new('RGB', (W, max(f.height, s.height)), 'white')
img.paste(f, (0, 0)); img.paste(s, (f.width + 20, 0))
img = img.resize((W * 2, img.height * 2), Image.LANCZOS)
img.save(f'{d}/overlay.png')
print('saved', f'{d}/overlay.png')

pat_ink = np.array(pat) < 128
r = np.array(Image.open(f'{d}/front.png').convert('RGB')).astype(int)
sil = (r[..., 0] > 150) & (r[..., 1] < 120)
h = sil.shape[0]
for py in range(312, 470, 8):
    ry = py - (562 - (h - MARGIN))
    p = np.where(pat_ink[py, 120:244])[0]
    m = np.where(sil[ry, :140])[0]
    print(f'y={(562 - py) / 64:4.2f} studs   patent arm reach {(243.5 - (120 + p.min())) / 64 if len(p) else 0:4.2f}   render {(140 - m.min()) / 64 if len(m) else 0:4.2f}')
