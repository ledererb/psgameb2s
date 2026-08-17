import base64, json, os, sys, urllib.request

KEY = os.environ["GEMINI_KEY"]
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-pro-image")
name = sys.argv[1]
base_hex = sys.argv[2]
desc = sys.argv[3]

img_b64 = base64.b64encode(open(f"/tmp/print_crops/{name}.png", "rb").read()).decode()
prompt = (
    "This image shows a printed design on a t-shirt (photographed on fabric, with folds and lighting). "
    "Redraw it as a CLEAN, FLAT, high-resolution graphic, exactly as it would look as the original print artwork: "
    "remove all fabric texture, wrinkles, shadows and photo lighting; keep the EXACT design, characters, text, "
    "layout and colors of the print. Sharp vector-like edges, solid colors. "
    f"The design: {desc}. "
    f"Output: the print centered on a solid uniform background of exactly {base_hex}, filling most of the frame. "
    "No shirt, no mannequin, no fabric — just the flat artwork on the solid background."
)

body = {
    "contents": [{"parts": [
        {"text": prompt},
        {"inline_data": {"mime_type": "image/png", "data": img_b64}},
    ]}],
    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
}
req = urllib.request.Request(
    f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.load(r)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500]); sys.exit(1)

for part in resp.get("candidates", [{}])[0].get("content", {}).get("parts", []):
    if "inlineData" in part:
        out = f"/tmp/gen/{name}.png"
        os.makedirs("/tmp/gen", exist_ok=True)
        open(out, "wb").write(base64.b64decode(part["inlineData"]["data"]))
        print("OK", out, len(part["inlineData"]["data"]) // 1024, "KB")
        sys.exit(0)
    if "text" in part:
        print("TEXT:", part["text"][:300])
print("NEM JOTT KEP"); sys.exit(1)
