from pathlib import Path
root=Path(__file__).resolve().parents[3]
p=root/'open.html';s=p.read_text(encoding='utf-8')
s=s.replace('            <div class="input-group">\n              <label data-lang="labelMediaMode">', '            <details id="room-options" class="room-options">\n              <summary data-lang="roomOptions">إعدادات الغرفة والجدولة</summary>\n            <div class="input-group">\n              <label data-lang="labelMediaMode">',1)
s=s.replace('            <div class="form-actions">\n              <button type="submit" class="btn btn-primary" data-lang="btnCreateRoom">','            </details>\n            <p id="draft-restored" class="form-note" data-lang="draftRestored" hidden>رجعنا مسودتك. أدخل كلمة مرور الغرفة مجددًا إذا كنت فعّلتها.</p>\n            <div class="form-actions">\n              <button type="submit" class="btn btn-primary" data-lang="btnCreateRoom">',1)
s=s.replace("                createFormTitle: 'New focus room',", "                createFormTitle: 'New focus room', roomOptions: 'Room settings and schedule', draftRestored: 'Your draft is back. Re-enter the room password if you enabled it.',")
s=s.replace("                createFormTitle: 'غرفة تركيز جديدة',", "                createFormTitle: 'غرفة تركيز جديدة', roomOptions: 'إعدادات الغرفة والجدولة', draftRestored: 'رجعنا مسودتك. أدخل كلمة مرور الغرفة مجددًا إذا كنت فعّلتها.',")
# Save only bounded, non-sensitive fields in this tab. Passwords are excluded.
draft='''        const ROOM_DRAFT_KEY = 'halastudyRoomDraft:v1';
        const DRAFT_TTL = 30 * 60 * 1000;
        let roomDraftMediaMode = null;
        function saveRoomDraft() {
            const fields = ['room-name', 'schedule-date', 'schedule-time', 'schedule-cadence', 'schedule-focus', 'schedule-break', 'schedule-goal-template'];
            const values = Object.fromEntries(fields.map((id) => [id, document.getElementById(id).value.slice(0, id === 'schedule-goal-template' ? 80 : 48)]));
            values.requirePassword = requirePasswordCheckbox.checked;
            values.scheduleEnabled = enableScheduleCheckbox.checked;
            values.mediaMode = selectedMediaMode;
            try { sessionStorage.setItem(ROOM_DRAFT_KEY, JSON.stringify({ version: 1, expiresAt: Date.now() + DRAFT_TTL, values })); } catch (_error) { /* A draft is optional. */ }
        }
        function restoreRoomDraft() {
            try {
                const draft = JSON.parse(sessionStorage.getItem(ROOM_DRAFT_KEY) || 'null');
                if (!draft || draft.version !== 1 || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= Date.now() || draft.expiresAt > Date.now() + DRAFT_TTL || !draft.values || typeof draft.values !== 'object') {
                    sessionStorage.removeItem(ROOM_DRAFT_KEY); return;
                }
                const values = draft.values;
                const restore = (id, check, max) => {
                    const value = values[id];
                    if (typeof value === 'string' && value.length <= max && check(value)) document.getElementById(id).value = value;
                };
                restore('room-name', () => true, 48);
                restore('schedule-goal-template', () => true, 80);
                restore('schedule-date', (v) => /^\\d{4}-\\d{2}-\\d{2}$/.test(v), 10);
                restore('schedule-time', (v) => /^\\d{2}:\\d{2}$/.test(v), 5);
                restore('schedule-cadence', (v) => ['once','weekdays','daily','weekly'].includes(v), 8);
                restore('schedule-focus', (v) => /^\\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 240, 3);
                restore('schedule-break', (v) => /^\\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 120, 3);
                requirePasswordCheckbox.checked = values.requirePassword === true;
                roomPasswordInput.disabled = !requirePasswordCheckbox.checked;
                roomPasswordInput.value = '';
                enableScheduleCheckbox.checked = values.scheduleEnabled === true;
                roomDraftMediaMode = normalizeMediaMode(values.mediaMode);
                document.getElementById('room-options').open = true;
                document.getElementById('draft-restored').hidden = false;
            } catch (_error) { try { sessionStorage.removeItem(ROOM_DRAFT_KEY); } catch (_ignored) {} }
        }
        createForm.addEventListener('input', saveRoomDraft);
        createForm.addEventListener('change', saveRoomDraft);
        document.getElementById('schedule-gate-cta').addEventListener('click', saveRoomDraft);
'''
s=s.replace("        const joinCodeInput = document.getElementById('join-code');",draft+"        const joinCodeInput = document.getElementById('join-code');",1)
s=s.replace('            scheduleFields.hidden = !enableScheduleCheckbox.checked;', "            scheduleFields.hidden = !enableScheduleCheckbox.checked;\n            if (enableScheduleCheckbox.checked) document.getElementById('room-options').open = true;")
s=s.replace("                button.setAttribute('aria-checked', active ? 'true' : 'false');", "                button.setAttribute('aria-checked', active ? 'true' : 'false');")
s=s.replace('                selectedMediaMode = MEDIA_MODE_MESH;\n            }\n            syncMediaModeUi();', '                selectedMediaMode = MEDIA_MODE_MESH;\n            } else if (roomDraftMediaMode) { selectedMediaMode = roomDraftMediaMode; }\n            syncMediaModeUi();',1)
s=s.replace("                result.hidden = false;", "                result.hidden = false;\n                try { sessionStorage.removeItem(ROOM_DRAFT_KEY); } catch (_error) {}\n                document.getElementById('draft-restored').hidden = true;",1)
s=s.replace('        setDefaultScheduleFields();\n        toggleScheduleFields();\n        initAccountFeatures();','        setDefaultScheduleFields();\n        restoreRoomDraft();\n        toggleScheduleFields();\n        initAccountFeatures();',1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Per-tab draft retention and optional settings disclosure added.')
