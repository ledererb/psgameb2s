# Póló-print pipeline (DRK x VATES skinek)

Forrásfotók: lokálisan `../../../dorko-ref/` (dorko.hu galériaképek, NINCS repóban).
Generálás: `GEMINI_KEY=... python3 scripts/gen_print.py <skin> <base_hex> "<leírás>"`
→ `/tmp/gen/<skin>.png` (gemini-3-pro-image; a gemini-3.7-flash NEM tud képet).
Összeállítás: `scripts/compose_skin_textures.py` → `assets/skins/*.png` (1024×512,
hát: u≈0.25 tükrözve, elöl: u≈0.75). Ellenőrzés: `dev-skins-preview.html` (front+back).
