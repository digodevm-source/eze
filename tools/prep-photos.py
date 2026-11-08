# Готовит фото для сайта: name.webp (до 1800 px) и name-sm.webp (до 900 px).
# Использование: python3 lipa-prep.py <папка с исходниками> <assets/img>
import sys, os
from PIL import Image, ImageOps
src, dst = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(src)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp', '.heic'): continue
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, f))).convert('RGB')
    for w, suffix in ((1800, ''), (900, '-sm')):
        out = im.copy()
        if max(out.size) > w:
            out.thumbnail((w, w), Image.LANCZOS)
        out.save(os.path.join(dst, f'{name}{suffix}.webp'), 'WEBP', quality=80, method=6)
    print(name, im.size)
