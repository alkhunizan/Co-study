function Room({ room, onLeave }) {
  const { t, lang } = useLang();
  const [tab, setTab] = React.useState('focus'); // focus | break
  const [running, setRunning] = React.useState(true);
  const [seconds, setSeconds] = React.useState(22 * 60 + 14);
  const [status, setStatus] = React.useState('studying');
  const [goal, setGoal] = React.useState(lang === 'ar' ? 'إنهاء فصل الديناميكا الحرارية' : 'Finish thermodynamics chapter');
  const [todos, setTodos] = React.useState([
    { id: 1, text: lang==='ar' ? 'مراجعة المسائل ٥-٨' : 'Review problems 5–8', prio: 'high', done: false },
    { id: 2, text: lang==='ar' ? 'كتابة الملخص' : 'Write the summary', prio: 'med', done: true },
    { id: 3, text: lang==='ar' ? 'جدول المعادلات' : 'Equation cheat sheet', prio: 'low', done: false },
  ]);
  const [msgs, setMsgs] = React.useState([
    { from: 'sys', text: t.sysJoined('Nora') },
    { from: 'Nora', text: t.msg1 },
    { from: 'You', text: t.msg2 },
    { from: 'sys', text: t.sysStarted('Layan') },
    { from: 'Layan', text: t.msg3 },
  ]);
  const [draft, setDraft] = React.useState('');
  const [sound, setSound] = React.useState('rain');
  const [soundOpen, setSoundOpen] = React.useState(false);
  const [camOn, setCamOn] = React.useState(true);

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const sendMsg = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setMsgs(m => [...m, { from: 'You', text: draft }]);
    setDraft('');
  };

  return (
    <div style={{minHeight:'100vh',background:'var(--paper)',color:'var(--ink)',display:'flex',flexDirection:'column'}}>
      <RoomTopBar room={room} onLeave={onLeave}/>
      <RoomMeta room={room}/>
      <main style={{
        display:'grid',
        gridTemplateColumns:'320px 1fr 320px',
        gap:18,
        padding:'0 clamp(20px,3vw,40px) 24px',
        flex:1,minHeight:0
      }}>
        <LeftPane status={status} setStatus={setStatus} goal={goal} setGoal={setGoal} todos={todos} setTodos={setTodos}/>
        <CenterPane camOn={camOn} setCamOn={setCamOn} tab={tab} setTab={setTab} mm={mm} ss={ss} running={running} setRunning={setRunning} setSeconds={setSeconds}/>
        <RightPane msgs={msgs} draft={draft} setDraft={setDraft} sendMsg={sendMsg} sound={sound} setSound={setSound} soundOpen={soundOpen} setSoundOpen={setSoundOpen}/>
      </main>
    </div>
  );
}

function RoomTopBar({ room, onLeave }) {
  const { t } = useLang();
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);
  return (
    <header style={{padding:'14px clamp(20px,3vw,40px) 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <Logo size={16}/>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <LangSwitch />
        <IconBtn icon={dark?'sun':'moon'} onClick={()=>setDark(d=>!d)} title="Theme"/>
        <IconBtn icon="share" title="Share"/>
        <Button variant="danger" size="sm" icon="x" onClick={onLeave}>{t.leave}</Button>
      </div>
    </header>
  );
}

function RoomMeta({ room }) {
  const { t } = useLang();
  return (
    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',padding:'4px clamp(20px,3vw,40px) 14px'}}>
      <Pill tone="line"><span style={{color:'var(--ink-3)'}}>{t.roomLabel}</span> <b style={{color:'var(--ink)',fontFamily:'var(--font-mono)',letterSpacing:'0.1em',marginInlineStart:6}}>{room.code}</b></Pill>
      <Pill tone="line" icon="circle"><span style={{color:'var(--ink-3)'}}>Media</span> <b style={{color:'var(--ink)',marginInlineStart:6}}>{t.mediaMesh}</b></Pill>
      <Pill tone="live" dot="var(--danger)"><b>3 / 4</b></Pill>
      <span style={{color:'var(--ink-2)',fontSize:13,marginInlineStart:8}}>{room.name}</span>
    </div>
  );
}

function LeftPane({ status, setStatus, goal, setGoal, todos, setTodos }) {
  const { t } = useLang();
  const members = [
    { name: 'Nora · نورة', presence: 'online', status: 'Focusing · 22m' },
    { name: 'You',          presence: 'online', status: t.statusStudying, self: true },
    { name: 'Layan · ليان', presence: 'away',   status: t.statusMeal },
  ];
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,minHeight:0,overflow:'auto',paddingInlineEnd:4}}>
      <Card padding={18}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <span style={{fontWeight:600,fontSize:13}}>{t.members}</span>
          <span style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--font-mono)'}}>3</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {members.map((m,i) => (
            <div key={i} style={{display:'flex',gap:10,alignItems:'center'}}>
              <Avatar name={m.name} presence={m.presence} size={32}/>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--ink)',display:'flex',gap:6,alignItems:'center'}}>{m.name}{m.self && <span style={{fontSize:10,padding:'1px 6px',borderRadius:999,background:'var(--accent-soft)',color:'var(--accent-3)',fontWeight:700}}>YOU</span>}</div>
                <div style={{fontSize:12,color:'var(--ink-2)'}}>{m.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card padding={18}>
        <div style={{fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-2)',fontWeight:600,marginBottom:10}}>{t.myStatus}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
          {[
            ['studying','book',t.statusStudying],
            ['working','briefcase',t.statusWorking],
            ['meal','utensils',t.statusMeal],
            ['away','walk',t.statusAway],
          ].map(([k,ic,l])=>(
            <button key={k} onClick={()=>setStatus(k)} style={{
              display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderRadius:12,
              border:`1px solid ${status===k?'var(--accent)':'var(--line)'}`,
              background: status===k ? 'var(--accent-soft)' : 'transparent',
              color: status===k ? 'var(--accent-3)' : 'var(--ink-2)',
              fontWeight:600,fontSize:12,cursor:'pointer',fontFamily:'inherit',textAlign:'start',minWidth:0
            }}><Icon name={ic} size={13}/> <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l}</span></button>
          ))}
        </div>
      </Card>
      <Card padding={18}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <span style={{fontWeight:600,fontSize:13}}>{t.boardTitle}</span>
          <span style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--font-mono)'}}>{todos.filter(x=>x.done).length}/{todos.length}</span>
        </div>
        <div style={{height:4,borderRadius:999,background:'var(--inset)',marginBottom:14,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${(todos.filter(x=>x.done).length/Math.max(1,todos.length))*100}%`,background:'var(--accent)',transition:'width 380ms'}}/>
        </div>
        <label style={{fontSize:12,color:'var(--ink-2)',fontWeight:600,display:'block',marginBottom:6}}>{t.boardGoal}</label>
        <input value={goal} onChange={(e)=>setGoal(e.target.value)} placeholder={t.boardGoalPlace}
          style={{width:'100%',padding:'10px 12px',borderRadius:12,border:'1px solid var(--line)',background:'var(--inset)',fontSize:13,fontFamily:'inherit',color:'var(--ink)',marginBottom:12,boxSizing:'border-box'}}/>
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <input placeholder={t.addTask}
            style={{flex:1,padding:'10px 12px',borderRadius:12,border:'1px solid var(--line)',background:'var(--inset)',fontSize:13,fontFamily:'inherit',color:'var(--ink)',boxSizing:'border-box'}}/>
          <button style={{width:38,height:38,border:0,borderRadius:11,background:'var(--accent)',color:'var(--ink)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="plus" size={16} stroke={2}/></button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {todos.map(td => (
            <TodoItem key={td.id} todo={td} onToggle={()=>setTodos(ts=>ts.map(x=>x.id===td.id?{...x,done:!x.done}:x))}/>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TodoItem({ todo, onToggle }) {
  const prioColor = { high: 'var(--prio-high)', med: 'var(--prio-med)', low: 'var(--prio-low)' }[todo.prio];
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,
      background:'var(--inset)',border:'1px solid transparent',transition:'all 220ms',
    }}>
      <span style={{width:3,height:18,borderRadius:2,background:prioColor,flexShrink:0}}/>
      <button onClick={onToggle} style={{
        width:18,height:18,borderRadius:6,border:`2px solid ${todo.done?'var(--accent)':'var(--line-strong)'}`,
        background:todo.done?'var(--accent)':'transparent',color:'var(--ink)',cursor:'pointer',
        display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0
      }}>{todo.done && <Icon name="check" size={11} stroke={3}/>}</button>
      <span style={{flex:1,fontSize:13,color: todo.done?'var(--ink-3)':'var(--ink)',textDecoration: todo.done?'line-through':'none'}}>{todo.text}</span>
    </div>
  );
}

function CenterPane({ camOn, setCamOn, tab, setTab, mm, ss, running, setRunning, setSeconds }) {
  const { t, lang } = useLang();
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
      {/* Video */}
      <div style={{flex:1,minHeight:280,background:'#0f0c08',borderRadius:24,padding:6,display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr',gap:6,overflow:'hidden',position:'relative'}}>
        <BigCamTile name="Nora · نورة" focused/>
        <BigCamTile name={lang==='ar'?'أنت':'You'} self camOn={camOn}/>
        <BigCamTile name="Layan · ليان" away/>
        <BigCamTile empty/>
        {/* AI focus monitor — quiet line */}
        <div style={{position:'absolute',top:16,insetInlineStart:16,display:'inline-flex',alignItems:'center',gap:8,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)',padding:'6px 12px',borderRadius:999,color:'#F0E7DA',fontSize:11.5,fontWeight:600}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'var(--success)'}}/>
          {t.aiMonitor} · <span style={{opacity:0.7,fontWeight:400}}>{t.aiReady}</span>
        </div>
        {/* Cam controls */}
        <div style={{position:'absolute',insetBlockEnd:16,insetInlineStart:'50%',transform:'translateX(-50%)',display:'inline-flex',gap:8,padding:6,borderRadius:999,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)'}}>
          <button onClick={()=>setCamOn(c=>!c)} title="Camera" style={{width:38,height:38,borderRadius:'50%',border:0,background: camOn?'var(--accent)':'rgba(255,255,255,0.12)',color: camOn ? 'var(--ink)':'#fff',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name={camOn?'camera':'camera-off'} size={16}/></button>
          <button title="Mic" style={{width:38,height:38,borderRadius:'50%',border:0,background:'rgba(255,255,255,0.12)',color:'#fff',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="mic-off" size={16}/></button>
        </div>
      </div>
      {/* Timer */}
      <Card padding={20}>
        <div style={{display:'flex',justifyContent:'center',gap:4,padding:4,background:'var(--inset)',borderRadius:999,width:'fit-content',margin:'0 auto 14px'}}>
          {[['focus',t.focusMode],['break',t.breakMode]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              padding:'6px 18px',borderRadius:999,border:0,cursor:'pointer',fontFamily:'inherit',
              background: tab===k ? 'var(--card)':'transparent',
              color: tab===k ? 'var(--accent-3)':'var(--ink-2)',
              fontWeight:600,fontSize:13,boxShadow: tab===k ? 'var(--sh-1)':'none'
            }}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:32}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:64,fontWeight:700,lineHeight:1,letterSpacing:'0.02em',color:'var(--ink)',fontVariantNumeric:'tabular-nums'}}>{mm}:{ss}</div>
          <div style={{borderInlineStart:'1px solid var(--line)',paddingInlineStart:24,display:'flex',flexDirection:'column',gap:4}}>
            <span style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--ink-2)',fontWeight:600}}>{t.todayFocus}</span>
            <span style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:600,color:'var(--ink)',letterSpacing:'-0.02em'}}>3<span style={{color:'var(--ink-3)',fontSize:14,marginInlineStart:3}}>h</span> 42<span style={{color:'var(--ink-3)',fontSize:14,marginInlineStart:3}}>m</span></span>
          </div>
        </div>
        <div style={{display:'flex',gap:14,justifyContent:'center',marginTop:18}}>
          <button onClick={()=>{setRunning(false); setSeconds(25*60);}} style={{width:48,height:48,borderRadius:'50%',border:'1px solid var(--line)',background:'var(--card)',color:'var(--ink)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--sh-1)'}}><Icon name="reset" size={18}/></button>
          <button onClick={()=>setRunning(r=>!r)} style={{width:56,height:56,borderRadius:'50%',border:0,background:'var(--accent)',color:'var(--ink)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--sh-lamp)'}}><Icon name={running?'pause':'play'} size={22}/></button>
        </div>
      </Card>
    </div>
  );
}

function BigCamTile({ name, self, focused, away, empty, camOn }) {
  if (empty) return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.15)',borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(240,231,218,0.4)',fontSize:13}}>
      Open seat
    </div>
  );
  if (self && !camOn) return (
    <div style={{background:'#1c1814',borderRadius:18,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:'#A89B86',position:'relative'}}>
      <Icon name="camera-off" size={28}/>
      <span style={{fontSize:13}}>Camera off</span>
      <div style={{position:'absolute',top:10,insetInlineStart:10,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(6px)',padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:600,color:'#F0E7DA'}}>{name}</div>
    </div>
  );
  return (
    <div style={{
      borderRadius:18,position:'relative',overflow:'hidden',
      background: self
        ? 'radial-gradient(80% 60% at 40% 30%, #5a4a3a 0%, #1c1814 100%)'
        : focused
          ? 'radial-gradient(70% 70% at 40% 30%, #806852 0%, #2a241e 100%)'
          : 'radial-gradient(70% 70% at 50% 50%, #3a342d 0%, #14110d 100%)',
      border: focused ? '2px solid var(--accent)' : '2px solid transparent',
      boxShadow: focused ? '0 0 24px rgba(229,182,140,0.25)' : 'none',
    }}>
      {/* Fake person silhouette */}
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax" style={{width:'80%',height:'80%',opacity:away?0.15:0.30}}>
          <circle cx="50" cy="40" r="14" fill="rgba(255,255,255,0.6)"/>
          <path d="M20 100 C20 78, 35 65, 50 65 C65 65, 80 78, 80 100" fill="rgba(255,255,255,0.6)"/>
        </svg>
      </div>
      <div style={{position:'absolute',top:10,insetInlineStart:10,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)',padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:600,color:'#F0E7DA',display:'inline-flex',alignItems:'center',gap:5}}>
        {focused && <span style={{width:6,height:6,borderRadius:'50%',background:'var(--success)'}}/>}
        {away && <span style={{width:6,height:6,borderRadius:'50%',background:'var(--warn)'}}/>}
        {name}
      </div>
      {self && <div style={{position:'absolute',insetBlockEnd:10,insetInlineEnd:10,background:'var(--accent)',color:'var(--ink)',padding:'3px 8px',borderRadius:999,fontSize:10,fontWeight:700}}>YOU</div>}
    </div>
  );
}

function RightPane({ msgs, draft, setDraft, sendMsg, sound, setSound, soundOpen, setSoundOpen }) {
  const { t, lang } = useLang();
  const sounds = [
    ['rain','cloud-rain',t.soundRain],
    ['forest','trees',t.soundForest],
    ['fire','flame',t.soundFire],
    ['cafe','coffee',t.soundCafe],
    ['ocean','waves',t.soundOcean],
    ['off','x',t.soundOff],
  ];
  const soundEntry = sounds.find(s=>s[0]===sound);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
      <Card padding={18} style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <span style={{fontWeight:600,fontSize:13}}>{t.chatTitle}</span>
          <Pill tone="live" dot="var(--danger)" size="sm">LIVE</Pill>
        </div>
        <div style={{flex:1,minHeight:0,overflow:'auto',display:'flex',flexDirection:'column',gap:8,paddingInlineEnd:4}}>
          {msgs.map((m,i)=>(
            <ChatMsg key={i} msg={m}/>
          ))}
        </div>
        <form onSubmit={sendMsg} style={{display:'flex',gap:6,marginTop:12,background:'var(--inset)',borderRadius:999,padding:5,alignItems:'center'}}>
          <input value={draft} onChange={(e)=>setDraft(e.target.value)} placeholder={t.chatPlace} style={{flex:1,border:0,background:'transparent',padding:'8px 12px',fontSize:13,fontFamily:'inherit',color:'var(--ink)',outline:'none',minWidth:0}}/>
          <button type="submit" style={{width:32,height:32,borderRadius:'50%',border:0,background:'var(--accent)',color:'var(--ink)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name="send" size={14}/></button>
        </form>
      </Card>
      <Card padding={16} style={{position:'relative'}}>
        <button onClick={()=>setSoundOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:10,width:'100%',background:'transparent',border:0,cursor:'pointer',fontFamily:'inherit',color:'var(--ink)',textAlign:'start'}}>
          <span style={{width:34,height:34,borderRadius:10,background:'var(--accent-soft)',color:'var(--accent-3)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name={soundEntry?.[1] || 'volume'} size={16}/>
          </span>
          <span style={{flex:1,fontSize:13,fontWeight:600}}>{t.ambient}</span>
          <span style={{fontSize:12,color:'var(--ink-2)'}}>{soundEntry?.[2]}</span>
          <Icon name="arrow-d" size={14} style={{color:'var(--ink-2)',transform: soundOpen ? 'rotate(180deg)' : 'none',transition:'transform 220ms'}}/>
        </button>
        {soundOpen && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:12,paddingTop:12,borderTop:'1px solid var(--line-2)'}}>
            {sounds.map(([k,ic,l])=>(
              <button key={k} onClick={()=>{setSound(k); setSoundOpen(false);}} style={{
                display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,
                border:0,background: sound===k ? 'var(--accent-soft)':'transparent',
                color: sound===k ? 'var(--accent-3)':'var(--ink-2)',
                fontWeight: sound===k ? 600 : 500,fontSize:12.5,cursor:'pointer',fontFamily:'inherit',textAlign:'start'
              }}><Icon name={ic} size={14}/> {l}</button>
            ))}
          </div>
        )}
      </Card>
      <Card padding={18}>
        <div style={{fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-2)',fontWeight:600,marginBottom:8}}>{t.schedTitle}</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
          <span style={{fontSize:14,color:'var(--ink)',fontWeight:600}}>{t.schedNext}</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--accent-3)',fontWeight:700}}>{t.schedIn} 11:47</span>
        </div>
        <div style={{fontSize:12,color:'var(--ink-2)',marginBottom:12}}>{lang==='ar'?'الأحد ١٥ مايو · ٩:٠٠ مساءً':'Sun 15 May · 9:00 PM'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          <Stat label={t.schedOnTime} value="٦"/>
          <Stat label={t.schedMissed} value="١"/>
          <Stat label={t.schedStreak} value="٤"/>
        </div>
      </Card>
    </div>
  );
}

function ChatMsg({ msg }) {
  if (msg.from === 'sys') return <div style={{fontSize:11.5,color:'var(--ink-3)',textAlign:'center',padding:'4px 0'}}>{msg.text}</div>;
  const isYou = msg.from === 'You';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems: isYou ? 'flex-end' : 'flex-start',gap:2,maxWidth:'85%',alignSelf: isYou ? 'flex-end' : 'flex-start'}}>
      {!isYou && <span style={{fontSize:11,color:'var(--ink-3)',marginInlineStart:10}}>{msg.from}</span>}
      <span style={{
        background: isYou ? 'var(--accent)' : 'var(--inset)',
        color: isYou ? 'var(--ink)' : 'var(--ink)',
        padding:'8px 12px',borderRadius:14,
        borderBottomRightRadius: isYou ? 4 : 14,
        borderBottomLeftRadius:  isYou ? 14 : 4,
        fontSize:13.5,lineHeight:1.4
      }}>{msg.text}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{padding:'8px 10px',borderRadius:12,background:'var(--inset)',border:'1px solid var(--line-2)',display:'flex',flexDirection:'column',gap:2}}>
      <strong style={{fontSize:18,color:'var(--ink)',fontFeatureSettings:'"lnum" 0'}}>{value}</strong>
      <span style={{fontSize:10.5,color:'var(--ink-2)'}}>{label}</span>
    </div>
  );
}

Object.assign(window, { Room });
