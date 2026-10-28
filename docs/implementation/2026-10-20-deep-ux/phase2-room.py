from pathlib import Path
import re
root=Path(__file__).resolve().parents[3]
p=root/'index.html';s=p.read_text(encoding='utf-8')
s=s.replace('    </style>','    </style>\n    <link rel="stylesheet" href="/css/room-shell.css">',1)
s=s.replace('<div class="card" id="shared-board-card">','<details class="card room-tools" id="shared-board-card" open>\n        <summary data-lang="roomTools">Members and shared board</summary>\n        <div class="room-tool-content" tabindex="0">',1)
s=s.replace('    </div>\n\n    <div class="center-col">','        </div>\n    </details>\n\n    <div class="center-col">',1)
goal=re.search(r'            <label class="status-label status-goal-label"[^]*?</label>\n            <input[^]*?id="status-goal"[^]*?>',s) if False else re.search(r'            <label class="status-label status-goal-label"[^>]*>.*?</label>\n            <input[^\n]*id="status-goal"[^\n]*>',s)
if not goal: raise ValueError('Goal markup not found')
goal_markup=goal.group(0);s=s.replace(goal_markup,'',1)
s=s.replace('<div class="timer-box">','<div class="timer-box">\n            <h1 class="room-heading" data-lang="roomHeading">Room for focus</h1>\n            <div class="focus-intent">\n'+goal_markup+'\n            </div>',1)
s=s.replace('    <div class="card">\n        <div class="card-header"><div class="card-title" data-lang="chatTitle">Chat room</div></div>','    <details class="card room-tools" id="chat-room-card" open>\n        <summary data-lang="chatTitle">Chat room</summary>\n        <div class="room-tool-content" tabindex="0">',1)
s=s.replace('    </div>\n</main>','        </div>\n    </details>\n</main>',1)
s=s.replace("            timerSet: 'Focus',", "            roomTools: 'Members and shared board', roomHeading: 'Room for focus', addTaskLabel: 'Add shared task', roomVideoTitle: 'Study room video',\n            timerSet: 'Focus',")
s=s.replace("            timerSet: 'تركيز',", "            roomTools: 'الأعضاء واللوحة المشتركة', roomHeading: 'مساحتك للتركيز', addTaskLabel: 'أضف مهمة مشتركة', roomVideoTitle: 'فيديو غرفة الدراسة',\n            timerSet: 'تركيز',")
s=s.replace('id="add-task-btn" type="button"', 'id="add-task-btn" type="button" data-lang-title="addTaskLabel"')
s=s.replace('id="sfu-frame" class="sfu-frame"', 'id="sfu-frame" class="sfu-frame" title="Study room video" data-lang-title="roomVideoTitle"')
s=s.replace('        setJoinVisible(true);\n        if (savedName', '''        const roomLayout = window.matchMedia('(min-width: 1025px)');
        const syncRoomTools = () => {
            document.querySelectorAll('main > details.room-tools').forEach((panel) => { panel.open = roomLayout.matches; });
        };
        syncRoomTools();
        roomLayout.addEventListener('change', syncRoomTools);
        setJoinVisible(true);
        if (savedName''',1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Room shell and responsive secondary-tool disclosures added.')
