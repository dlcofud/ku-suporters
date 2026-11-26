"""gen.py가 만든 SVG를 2배 해상도로 찍어 apps/web/public/examples/*.webp 로 저장한다. (python3 gen.py && python3 render.py)"""
import pathlib, io
from playwright.sync_api import sync_playwright
from PIL import Image
here = pathlib.Path(__file__).parent
src = here / "svg"; out = here.parent.parent / "apps/web/public/examples"; out.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    for f in sorted(src.glob("*.svg")):
        s = f.read_text(); import re
        w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', s).groups())
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
        pg.set_content(f'<html><body style="margin:0">{s}</body></html>')
        png = pg.screenshot(clip={"x": 0, "y": 0, "width": w, "height": h})
        Image.open(io.BytesIO(png)).convert("RGB").save(out / f"{f.stem}.webp", "WEBP", quality=82)
        pg.close()
    b.close()
for f in sorted(out.glob("*.webp")): print(f.name, f.stat().st_size)
