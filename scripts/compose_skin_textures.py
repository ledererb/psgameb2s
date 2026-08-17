from PIL import Image
import os

GEN = "/tmp/gen"
OUT = "/Users/balazslederer/Desktop/Dev/snackydash/psgameb2s/assets/skins"
BASES = {
    "froccs": "#1B1B1B", "koviubi": "#D6DAC6", "liget": "#FFFFFF",
    "lanchid": "#FFFFFF", "hosok": "#FFFFFF", "langos": "#EAE3CE",
}
W, H = 1024, 512
PRINT_W, PRINT_H = 330, 350
CX_BACK, CX_FRONT, CY = 256, 768, 245

for name, base in BASES.items():
    img = Image.open(os.path.join(GEN, f"{name}.png")).convert("RGB")
    # középső tartalom-kivágás: a generált kép széleit levágjuk (a print „fills most of the frame")
    w, h = img.size
    m = int(min(w, h) * 0.02)
    img = img.crop((m, m, w - m, h - m))
    scale = min(PRINT_W / img.width, PRINT_H / img.height)
    p0 = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

    canvas = Image.new("RGB", (W, H), base)
    for cx, flip in ((CX_BACK, True), (CX_FRONT, False)):
        p = p0.transpose(Image.FLIP_LEFT_RIGHT) if flip else p0
        canvas.paste(p, (cx - p.width // 2, CY - p.height // 2))
    out = os.path.join(OUT, f"{name}.png")
    canvas.save(out, optimize=True)
    print(f"{name}: ok ({os.path.getsize(out)//1024} KB)")
