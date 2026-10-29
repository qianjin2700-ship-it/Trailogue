from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    files = sorted(source.glob("*.jpg"))
    if not files:
        raise SystemExit("No rendered PDF pages found")
    thumbs = []
    for index, file in enumerate(files, 1):
        image = Image.open(file).convert("RGB")
        image.thumbnail((360, 466), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (380, 510), "#d9d5cf")
        tile.paste(image, ((380 - image.width) // 2, 12))
        ImageDraw.Draw(tile).text((16, 482), f"Page {index}", fill="#25211d", font=ImageFont.load_default())
        thumbs.append(tile)
    columns = 4
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * 380, rows * 510), "#bdb7ae")
    for index, tile in enumerate(thumbs):
        sheet.paste(tile, ((index % columns) * 380, (index // columns) * 510))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)


if __name__ == "__main__":
    main()
