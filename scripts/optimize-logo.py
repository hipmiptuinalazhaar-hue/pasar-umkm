from pathlib import Path
from PIL import Image

SOURCE = Path("assets/logo.png")
TARGET = Path("assets/logo.webp")
IGNORE = Path(".assetsignore")

if not SOURCE.exists():
    raise SystemExit("assets/logo.png tidak ditemukan")

original_bytes = SOURCE.stat().st_size

with Image.open(SOURCE) as image:
    image.load()
    original_dimensions = image.size

    if max(image.size) > 768:
        image.thumbnail((768, 768), Image.Resampling.LANCZOS)

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")

    image.save(
        TARGET,
        format="WEBP",
        quality=88,
        method=6,
        exif=b"",
        icc_profile=None,
    )
    optimized_dimensions = image.size

optimized_bytes = TARGET.stat().st_size
reduction = (original_bytes - optimized_bytes) / original_bytes

if optimized_bytes >= original_bytes:
    raise SystemExit(
        f"Optimasi ditolak: WebP {optimized_bytes} >= PNG {original_bytes}"
    )
if reduction < 0.40:
    raise SystemExit(
        f"Runtime logo reduction {reduction:.1%} di bawah minimum 40%"
    )

text_paths = [Path("index.html")]
text_paths += sorted(Path("js").glob("*.js"))
text_paths += sorted(Path("css").glob("*.css"))

for path in text_paths:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    updated = text.replace("assets/logo.png", "assets/logo.webp")
    if updated != text:
        path.write_text(updated, encoding="utf-8")

remaining = []
for path in text_paths:
    if path.exists() and "assets/logo.png" in path.read_text(encoding="utf-8"):
        remaining.append(str(path))
if remaining:
    raise SystemExit("Referensi runtime PNG masih tersisa: " + ", ".join(remaining))

ignore_lines = IGNORE.read_text(encoding="utf-8").splitlines()
if "assets/logo.png" not in ignore_lines:
    ignore_lines.append("assets/logo.png")
if "scripts/" not in ignore_lines:
    ignore_lines.append("scripts/")
IGNORE.write_text("\n".join(ignore_lines).rstrip() + "\n", encoding="utf-8")

print(f"Original: {original_bytes} bytes, dimensions={original_dimensions}")
print(f"Optimized: {optimized_bytes} bytes, dimensions={optimized_dimensions}")
print(f"Reduction: {reduction * 100:.1f}%")
