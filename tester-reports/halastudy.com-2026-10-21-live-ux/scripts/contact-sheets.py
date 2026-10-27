from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json, math

root = Path(__file__).resolve().parents[1]
dest = root / 'verification' / 'journey-contact-sheets'
dest.mkdir(parents=True, exist_ok=True)
for folder in (root / 'journeys').iterdir():
    if not folder.is_dir() or not (folder / 'journey.json').is_file():
        continue
    result = json.loads((folder / 'journey.json').read_text(encoding='utf-8'))
    shots = list(folder.glob('step-*.png'))
    width, height, cols = (390, 664, 3) if result['viewport'] == 'mobile' else (720, 450, 2)
    sheet = Image.new('RGB', (cols * width, math.ceil(len(shots) / cols) * (height + 32)), '#e7e9ef')
    draw = ImageDraw.Draw(sheet)
    for n, shot in enumerate(shots):
        x, y = (n % cols) * width, (n // cols) * (height + 32)
        image = Image.open(shot).convert('RGB')
        thumb = ImageOps.contain(image, (width - 4, height - 4))
        draw.text((x + 10, y + 8), f"{folder.name} - step {n + 1}", fill='#111111')
        sheet.paste(thumb, (x + 2, y + 32))
    sheet.save(dest / f'{folder.name}.jpg', quality=90)
    print(folder.name, len(shots))
