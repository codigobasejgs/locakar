"""Gera ícones e splash screens do PWA a partir dos logos oficiais em public/logos.

Rodar só quando o logo mudar:  python scripts/generate-pwa-assets.py   (requer Pillow)
Aparelhos das splash screens vêm de APPLE_SPLASH em src/lib/pwa.ts; `npm run check` confere se todas existem.
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BG = (5, 5, 5, 255)  # #050505

seal = Image.open(PUBLIC / "logos/locakar-circular.png").convert("RGBA")
wordmark = Image.open(PUBLIC / "logos/locakar-logo-light.png").convert("RGBA")


def save(img: Image.Image, path: Path, colors: int = 128) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def centered(logo: Image.Image, size: tuple[int, int], logo_width: int, bg=BG) -> Image.Image:
    canvas = Image.new("RGBA", size, bg)
    ratio = logo_width / logo.width
    scaled = logo.resize((logo_width, round(logo.height * ratio)), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2))
    return canvas


# Site: selo circular. "any" transparente; "maskable" com o selo dentro da zona segura (80%).
for px in (192, 512):
    save(seal.resize((px, px), Image.LANCZOS), PUBLIC / f"icons/icon-{px}.png")
    save(centered(seal, (px, px), round(px * 0.76)), PUBLIC / f"icons/maskable-{px}.png")
# iOS não aceita transparência no ícone: fundo preto.
save(centered(seal, (180, 180), 162), ROOT / "src/app/apple-icon.png")
save(seal.resize((96, 96), Image.LANCZOS), ROOT / "src/app/icon.png")

# Sistema de gestão: logotipo sobre fundo preto (diferencia do app do site na tela inicial).
for px in (180, 192, 512):
    save(centered(wordmark, (px, px), round(px * 0.62)), PUBLIC / f"icons/admin-{px}.png")

# Splash screens iOS: lista lida de src/lib/pwa.ts (APPLE_SPLASH) — fonte única.
DEVICES = [
    (int(w), int(h), int(d), l == "true")
    for w, h, d, l in re.findall(r"\[(\d+), (\d+), (\d+), (true|false)\]", (ROOT / "src/lib/pwa.ts").read_text(encoding="utf8"))
]
assert DEVICES, "APPLE_SPLASH não encontrado em src/lib/pwa.ts"
for w, h, dpr, landscape in DEVICES:
    for pw, ph in [(w * dpr, h * dpr)] + ([(h * dpr, w * dpr)] if landscape else []):
        save(centered(wordmark, (pw, ph), round(min(pw, ph) * 0.46)), PUBLIC / f"splash/{pw}x{ph}.png", colors=64)

print("ok")
