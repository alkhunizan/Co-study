"""Version the changed shared assets so cached old modules cannot mix with new HTML."""
from pathlib import Path

root = Path(__file__).resolve().parents[4]
assets = {
    'platform.html': ['/design-system/colors_and_type.css', '/css/platform.css', '/js/focus-client.js', '/js/platform-copy.js', '/js/platform.js'],
    'index.html': ['/design-system/colors_and_type.css', '/css/room-shell.css', '/js/focus-client.js', '/js/room-focus.js'],
    'account.html': ['/design-system/colors_and_type.css', '/design-system/landing.css', '/js/safe-return.js'],
    'open.html': ['/design-system/colors_and_type.css', '/design-system/landing.css'],
    'lobby.html': ['/design-system/colors_and_type.css', '/design-system/landing.css'],
}
for name, paths in assets.items():
    target = root / name
    text = target.read_text(encoding='utf-8')
    for asset in paths:
        text = text.replace(f'"{asset}"', f'"{asset}?v=20261021-refinement"')
    target.write_text(text, encoding='utf-8')
print('Versioned changed asset references on five app entry pages.')
