from pathlib import Path
import re
repo = Path(__file__).resolve().parents[4]
email = '<a href="mailto:info@halastudy.com" dir="ltr">info@halastudy.com</a>'
for file in repo.glob('*.html'):
    text = file.read_text(encoding='utf-8')
    def footer(match):
        section = match.group(0)
        return section if 'mailto:info@halastudy.com' in section else section.replace('</footer>', f'\n    {email}\n  </footer>')
    updated = re.sub(r'<footer\b[^>]*>[\s\S]*?</footer>', footer, text)
    if updated != text:
        file.write_text(updated, encoding='utf-8', newline='\n')
        print(file.name)
