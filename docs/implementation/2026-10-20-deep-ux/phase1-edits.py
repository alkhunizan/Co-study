from pathlib import Path
root=Path(__file__).resolve().parents[3]
def edit(name, fn):
    p=root/name
    text=p.read_text(encoding='utf-8')
    p.write_text(fn(text), encoding='utf-8', newline='\n')

def room(s):
    s=s.replace("joinOverlay.classList.add('hidden');",'setJoinVisible(false);').replace("joinOverlay.classList.remove('hidden');",'setJoinVisible(true);')
    s=s.replace('        if (savedName && incomingRoom) {','        setJoinVisible(true);\n        if (savedName && incomingRoom) {')
    s=s.replace('<span data-lang="timerSet">Focus</span>:', '<label for="cfg-f" data-lang="timerSet">Focus</label>:')
    s=s.replace('<span data-lang="timerBreak">Break</span>:', '<label for="cfg-b" data-lang="timerBreak">Break</label>:')
    s=s.replace('onclick="resetTimer()">↻', 'data-lang-title="timerResetLabel" onclick="resetTimer()">↻')
    s=s.replace('id="btn-toggle" onclick=', 'id="btn-toggle" aria-label="Start focus" onclick=')
    s=s.replace('id="chat-send" type="submit"', 'id="chat-send" data-lang-title="chatSend" type="submit"')
    s=s.replace("        // Tab-title countdown while running", "        document.getElementById('btn-toggle').setAttribute('aria-label', timerRunning ? currentCopy().timerPauseLabel : currentCopy().timerStartLabel);\n        // Tab-title countdown while running")
    s=s.replace("            timerSet: 'Focus',", "            timerSet: 'Focus', timerStartLabel: 'Start focus', timerPauseLabel: 'Pause focus', timerResetLabel: 'Reset timer', chatSend: 'Send message',")
    s=s.replace("            timerSet: 'تركيز',", "            timerSet: 'تركيز', timerStartLabel: 'ابدأ التركيز', timerPauseLabel: 'أوقف التركيز مؤقتًا', timerResetLabel: 'أعد ضبط المؤقت', chatSend: 'أرسل الرسالة',")
    for old in ['.user-self {','.lang-option.active {','.timer-tab.active {','.btn-ctrl.main {']:
        start=s.index(old); end=s.index('}',start)
        s=s[:start]+s[start:end].replace('color: var(--accent);','color: var(--accent-3);')+s[end:]
    s=s.replace("button.classList.toggle('active', button.dataset.langValue === curLang);", "button.classList.toggle('active', button.dataset.langValue === curLang);\n            button.setAttribute('aria-pressed', String(button.dataset.langValue === curLang));")
    return s
edit('index.html',room)
for file in ['landing.html','open.html','account.html','blog.html']:
    edit(file,lambda s:s.replace('class="lang-switch" role="tablist"','class="lang-switch" role="group"'))
edit('public/js/platform.js',lambda s:s.replace("notice(t('saved'))","notice('saved')").replace("notice(t('networkError'), true)","notice('networkError', true)").replace("notice(t(outcome === 'success' ? 'checkoutSuccess' : outcome === 'declined' ? 'checkoutDeclined' : 'checkoutCanceled'))", "notice(outcome === 'success' ? 'checkoutSuccess' : outcome === 'declined' ? 'checkoutDeclined' : 'checkoutCanceled')").replace("notice(t(result.recoveryCodes.length ? 'securitySaved' : 'mfaReady'))", "notice(result.recoveryCodes.length ? 'securitySaved' : 'mfaReady')").replace('notice(errorText(error), true)', 'noticeError(error)'))
edit('public/js/halastudy-core.js',lambda s:s.replace("b.classList.toggle('is-on', b.getAttribute('data-lang-value') === langState.lang);", "b.classList.toggle('is-on', b.getAttribute('data-lang-value') === langState.lang);\n            b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-value') === langState.lang));"))
edit('open.html',lambda s:s.replace('data-media-mode="mesh" aria-checked=', 'data-media-mode="mesh" role="radio" tabindex="0" aria-checked=').replace('data-media-mode="sfu" aria-checked=', 'data-media-mode="sfu" role="radio" tabindex="-1" aria-checked=').replace("button.setAttribute('aria-checked', active ? 'true' : 'false');", "button.setAttribute('aria-checked', active ? 'true' : 'false');\n                button.tabIndex = active ? 0 : -1;"))
edit('blog-best-study-rooms.html',lambda s:s.replace('<div class="table-wrap">','<div class="table-wrap" tabindex="0" role="region" aria-label="جدول المقارنة">'))
edit('design-system/colors_and_type.css',lambda s:s.replace('#9AA0A4','#667075').replace('#A56B43','#89542F').replace('--ink-3:        #5A6573;', '--ink-3:        #A8B2C0;'))
print('Phase 1 edits applied')
