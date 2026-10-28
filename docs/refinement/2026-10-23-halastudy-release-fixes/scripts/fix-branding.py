"""Native wordmark names; no global DOM/textContent name reconstruction."""
from pathlib import Path
repo = Path(__file__).resolve().parents[4]
changed = []
for file in list(repo.glob('*.html')) + [repo / 'services/seo/public-pages.js']:
    text = file.read_text(encoding='utf-8')
    updated = text.replace(' aria-label="Halastudy home"', '')
    if file.name == 'account.html':
        for key in ('signinTitle', 'signupTitle'):
            updated = updated.replace(f'<h3 class="form-title" data-lang="{key}">', f'<h1 class="form-title" data-lang="{key}">')
        updated = updated.replace('أهلاً من جديد</h3>', 'أهلاً من جديد</h1>').replace('احجز مقعدك</h3>', 'احجز مقعدك</h1>')
        updated = updated.replace('<section id="account-view" class="hidden">', '<section id="account-view" class="hidden">\n      <h1 class="form-title" data-lang="accountTitle">حسابك وخياراتك</h1>')
        updated = updated.replace("pageTitle: 'Halastudy | Your account',", "pageTitle: 'Halastudy | Your account',\n          accountTitle: 'Your account and preferences',")
        # Preserve the actual existing English page title regardless of punctuation.
        if "accountTitle: 'Your account and preferences'" not in updated:
            updated = updated.replace("themeToggleTitle: 'Toggle theme',", "accountTitle: 'Your account and preferences',\n          themeToggleTitle: 'Toggle theme',")
        updated = updated.replace("themeToggleTitle: 'تبديل المظهر',", "accountTitle: 'حسابك وخياراتك',\n          themeToggleTitle: 'تبديل المظهر',")
        updated = updated.replace('<h3 class="form-title"', '<h2 class="form-title"').replace('</h3>', '</h2>')
    if updated != text:
        file.write_text(updated, encoding='utf-8', newline='\n')
        changed.append(file.relative_to(repo).as_posix())
print('\n'.join(changed))
