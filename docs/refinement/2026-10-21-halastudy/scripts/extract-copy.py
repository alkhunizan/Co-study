"""One-use mechanical extraction of the workspace's literal dictionaries."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[4]
source = root / 'public/js/platform.js'
text = source.read_text(encoding='utf-8')
assert 'HalaPlatformCopy' not in text, 'Already extracted'
start = text.index('    const ar = {};')
end = text.index('    let user = null;')
initial = text[start:end]
tail = text[end:]
pattern = re.compile(r'    Object\.assign\((?:ar|en), \{[\s\S]*?\}\);\n')
blocks = pattern.findall(tail)
assert len(blocks) >= 8, len(blocks)
tail = pattern.sub('', tail)
module = '(() => {\n' + initial + ''.join(blocks) + '    window.HalaPlatformCopy = { ar, en };\n})();\n'
(root / 'public/js/platform-copy.js').write_text(module, encoding='utf-8')
source.write_text(text[:start] + '    const { ar, en } = global.HalaPlatformCopy;\n' + tail, encoding='utf-8')
page = root / 'platform.html'
html = page.read_text(encoding='utf-8').replace('<script src="/js/platform.js" defer>', '<script src="/js/platform-copy.js" defer></script>\n  <script src="/js/platform.js" defer>')
page.write_text(html, encoding='utf-8')
print(f'Extracted initial copy and {len(blocks)} literal update blocks into platform-copy.js.')
