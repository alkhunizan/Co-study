function Landing({ onEnterRoom }) {
  const { t, lang } = useLang();
  const [mode, setMode] = React.useState('create'); // create | join
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [pwOn, setPwOn] = React.useState(false);
  const [pw, setPw] = React.useState('');
  const [schedOn, setSchedOn] = React.useState(false);
  const [cadence, setCadence] = React.useState('weekdays');

  const handleCreate = (e) => { e.preventDefault(); onEnterRoom({ name: name || (lang==='ar'?'جلسة عميقة':'Deep work'), code: 'A7K-2QF', scheduled: schedOn }); };
  const handleJoin = (e) => { e.preventDefault(); onEnterRoom({ name: lang==='ar' ? 'غرفة الجيران' : 'Neighbors room', code: (code || 'A7K-2QF').toUpperCase(), scheduled: false }); };

  return (
    <div style={{minHeight:'100vh',background:'var(--paper)',color:'var(--ink)',display:'flex',flexDirection:'column'}}>
      <TopBar />
      <main style={{flex:1,display:'flex',flexDirection:'column',gap:80,padding:'40px clamp(20px,5vw,80px) 80px',maxWidth:1200,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>
        <HeroSection />
        <ChooserSection mode={mode} setMode={setMode} />
        {mode === 'create' ? (
          <CreateForm
            name={name} setName={setName}
            pwOn={pwOn} setPwOn={setPwOn} pw={pw} setPw={setPw}
            schedOn={schedOn} setSchedOn={setSchedOn}
            cadence={cadence} setCadence={setCadence}
            onSubmit={handleCreate}
          />
        ) : (
          <JoinForm code={code} setCode={setCode} onSubmit={handleJoin} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function TopBar() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);
  return (
    <header style={{position:'sticky',top:0,zIndex:50,padding:'16px clamp(20px,5vw,60px)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--paper)',borderBottom:'1px solid var(--line-2)'}}>
      <Logo />
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <LangSwitch />
        <IconBtn icon={dark ? 'sun' : 'moon'} onClick={()=>setDark(d=>!d)} title="Toggle theme"/>
      </div>
    </header>
  );
}

function HeroSection() {
  const { t, lang } = useLang();
  return (
    <section style={{display:'grid',gridTemplateColumns:'1.1fr 0.9fr',gap:64,alignItems:'center',position:'relative',minHeight:480}}>
      <div style={{position:'absolute',inset:'-40px 0 -40px 0',background:'radial-gradient(40% 60% at 70% 30%, var(--accent-glow) 0%, transparent 60%)',pointerEvents:'none',zIndex:0}}/>
      <div style={{position:'relative',zIndex:1}}>
        <div style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:600,color:'var(--accent-2)',marginBottom:18,fontFamily: lang==='ar' ? 'var(--font-body-ar)' : 'var(--font-body)'}}>
          {t.eyebrow}
        </div>
        <h1 style={{
          fontFamily: lang==='ar' ? 'var(--font-display-ar)' : 'var(--font-display)',
          fontSize: 'clamp(40px, 5.5vw, 64px)', fontWeight: 600,
          letterSpacing: lang==='ar' ? '0' : '-0.025em',
          lineHeight: 1.05, color:'var(--ink)', margin:'0 0 24px'
        }}>
          <span style={{display:'block'}}>{t.heroTitle[0]}</span>
          <span style={{display:'block',fontStyle: lang==='ar' ? 'normal' : 'italic',color:'var(--accent-3)',fontWeight: lang==='ar' ? 700 : 500}}>{t.heroTitle[1]}</span>
        </h1>
        <p style={{fontSize:17,lineHeight:1.65,color:'var(--ink-2)',maxWidth:520,margin:'0 0 28px'}}>{t.heroSub}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:32}}>
          <Pill tone="accent" icon="camera">{t.featureLive}</Pill>
          <Pill tone="accent" icon="clock">{t.featurePomo}</Pill>
          <Pill tone="accent" icon="message">{t.featureChat}</Pill>
          <Pill tone="accent" icon="calendar">{t.featureSchedule}</Pill>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Button variant="primary" size="lg" icon="arrow-r">{t.cta}</Button>
          <Button variant="secondary" size="lg">{t.ctaAlt}</Button>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}

function HeroVisual() {
  const { t, lang } = useLang();
  return (
    <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',gap:14}}>
      <Card padding={22} style={{boxShadow:'var(--sh-4)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:'var(--danger)',animation:'hcPulse 1.6s infinite'}}/>
          <span style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:700,color:'var(--danger)'}}>Live</span>
          <span style={{fontSize:13,color:'var(--ink-2)',marginInlineStart:'auto'}}>3 / 4 · {t.roomLabel} <b style={{fontFamily:'var(--font-mono)',color:'var(--ink)',letterSpacing:'0.1em'}}>A7K-2QF</b></span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,height:180}}>
          <CamTile name="Nora" focused />
          <CamTile name="You" self />
          <CamTile name="Layan" />
          <CamTile name="—" empty />
        </div>
      </Card>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <Card padding={18}>
          <div style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--ink-2)',fontWeight:600,marginBottom:8}}>Focus</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:700,letterSpacing:'0.04em',color:'var(--ink)'}}>22:14</div>
        </Card>
        <Card padding={18}>
          <div style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--ink-2)',fontWeight:600,marginBottom:8}}>{t.todayFocus}</div>
          <div style={{fontFamily:'var(--font-display)',fontSize:32,fontWeight:600,color:'var(--ink)',letterSpacing:'-0.02em'}}>3<span style={{color:'var(--ink-3)',fontSize:18,marginInlineStart:6}}>hrs</span> 42<span style={{color:'var(--ink-3)',fontSize:18,marginInlineStart:6}}>min</span></div>
        </Card>
      </div>
    </div>
  );
}

function CamTile({ name, self, focused, empty }) {
  if (empty) {
    return (
      <div style={{background:'var(--inset)',border:'1px dashed var(--line)',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)',fontSize:12}}>
        Open seat
      </div>
    );
  }
  return (
    <div style={{
      background: self ? 'linear-gradient(135deg,#3a342d,#1c1814)' : 'linear-gradient(135deg,#2a241e,#14110d)',
      borderRadius:14,position:'relative',overflow:'hidden',
      border: focused ? '2px solid var(--accent)' : '2px solid transparent',
    }}>
      <div style={{position:'absolute',inset:0,background:`radial-gradient(60% 60% at 50% 40%, rgba(229,182,140,${self?0.18:0.10}), transparent 70%)`}}/>
      <div style={{position:'absolute',top:8,insetInlineStart:8,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)',color:'#F0E7DA',fontSize:10.5,padding:'3px 8px',borderRadius:999,fontWeight:600,display:'inline-flex',alignItems:'center',gap:5}}>
        {focused && <span style={{width:6,height:6,borderRadius:'50%',background:'var(--success)'}}/>}
        {name}
      </div>
      {self && <div style={{position:'absolute',bottom:8,insetInlineEnd:8,background:'var(--accent)',color:'var(--ink)',fontSize:10,padding:'2px 8px',borderRadius:999,fontWeight:700}}>YOU</div>}
    </div>
  );
}

function ChooserSection({ mode, setMode }) {
  const { t } = useLang();
  return (
    <section>
      <div style={{maxWidth:560,marginBottom:24}}>
        <h2 style={{fontFamily:'var(--font-display)',fontSize:32,fontWeight:600,letterSpacing:'-0.02em',margin:'0 0 8px',color:'var(--ink)'}}>{t.chooserTitle}</h2>
        <p style={{fontSize:15,color:'var(--ink-2)',margin:0}}>{t.chooserSub}</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,maxWidth:720}}>
        <ChoiceCard active={mode==='create'} onClick={()=>setMode('create')} icon="plus" title={t.createTitle} desc={t.createDesc}/>
        <ChoiceCard active={mode==='join'} onClick={()=>setMode('join')} icon="arrow-r" title={t.joinTitle} desc={t.joinDesc}/>
      </div>
    </section>
  );
}

function ChoiceCard({ active, onClick, icon, title, desc }) {
  return (
    <button onClick={onClick} style={{
      textAlign:'start',padding:20,borderRadius:24,
      background: active ? 'rgba(224,176,139,0.10)' : 'var(--card)',
      border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      boxShadow: active ? 'var(--sh-3)' : 'var(--sh-1)',
      display:'flex',alignItems:'center',gap:14,cursor:'pointer',
      transition:'all 220ms cubic-bezier(0.32,0.72,0.32,1)',
      fontFamily:'inherit',
    }}>
      <span style={{width:44,height:44,borderRadius:14,background:'linear-gradient(135deg, rgba(224,176,139,0.3), rgba(224,176,139,0.08))',color:'var(--accent-3)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <Icon name={icon} size={20}/>
      </span>
      <div>
        <h3 style={{margin:'0 0 4px',fontSize:16,fontWeight:600,color:'var(--ink)'}}>{title}</h3>
        <p style={{margin:0,fontSize:13,color:'var(--ink-2)',lineHeight:1.45}}>{desc}</p>
      </div>
    </button>
  );
}

function CreateForm(props) {
  const { t } = useLang();
  const { name, setName, pwOn, setPwOn, pw, setPw, schedOn, setSchedOn, cadence, setCadence, onSubmit } = props;
  return (
    <form onSubmit={onSubmit} style={{maxWidth:560}}>
      <Card padding={28}>
        <h3 style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:600,margin:'0 0 20px',paddingBottom:14,borderBottom:'1px solid var(--line)',color:'var(--ink)'}}>{t.formCreateTitle}</h3>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <Input label={t.labelName} placeholder={t.placeName} value={name} onChange={setName}/>
          <CheckboxTile checked={pwOn} onChange={setPwOn} icon="lock" label={t.labelPassword}/>
          {pwOn && <Input type="password" placeholder={t.placePassword} value={pw} onChange={setPw}/>}
          <CheckboxTile checked={schedOn} onChange={setSchedOn} icon="calendar" label={t.labelSchedule}/>
          {schedOn && <SchedulePanel cadence={cadence} setCadence={setCadence}/>}
          <div style={{display:'flex',gap:12,marginTop:8}}>
            <Button type="submit" variant="primary" size="lg" icon="arrow-r">{t.btnCreate}</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

function JoinForm({ code, setCode, onSubmit }) {
  const { t } = useLang();
  return (
    <form onSubmit={onSubmit} style={{maxWidth:560}}>
      <Card padding={28}>
        <h3 style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:600,margin:'0 0 20px',paddingBottom:14,borderBottom:'1px solid var(--line)',color:'var(--ink)'}}>{t.formJoinTitle}</h3>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <Input label={t.labelCode} placeholder={t.placeCode} value={code} onChange={setCode} forceLtr mono/>
          <Input label={t.labelJoinPw} placeholder={t.placeJoinPw} type="password"/>
          <div style={{display:'flex',gap:12,marginTop:8}}>
            <Button type="submit" variant="primary" size="lg" icon="arrow-r">{t.btnJoin}</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

function CheckboxTile({ checked, onChange, icon, label }) {
  return (
    <button type="button" onClick={()=>onChange(!checked)} style={{
      display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderRadius:16,
      background:checked ? 'var(--accent-soft)' : 'var(--card)',
      border:`1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
      cursor:'pointer',fontFamily:'inherit',color:'var(--ink)',textAlign:'start'
    }}>
      <span style={{
        width:20,height:20,borderRadius:6,
        background:checked ? 'var(--accent)' : 'transparent',
        border:`1.5px solid ${checked ? 'var(--accent)' : 'var(--line-strong)'}`,
        display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--ink)',flexShrink:0
      }}>{checked && <Icon name="check" size={14} stroke={2.5}/>}</span>
      <Icon name={icon} size={16} style={{color:'var(--ink-2)'}}/>
      <span style={{fontSize:14,fontWeight:500}}>{label}</span>
    </button>
  );
}

function SchedulePanel({ cadence, setCadence }) {
  const { t } = useLang();
  return (
    <div style={{padding:18,borderRadius:16,border:'1px solid var(--line)',background:'rgba(224,176,139,0.06)'}}>
      <p style={{fontSize:12.5,color:'var(--ink-2)',margin:'0 0 14px'}}>{t.scheduleNote}</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <Input label={t.labelDate} type="date" value="2026-05-15" onChange={()=>{}}/>
        <Input label={t.labelTime} type="time" value="21:00" onChange={()=>{}}/>
      </div>
      <div style={{marginTop:14}}>
        <label style={{fontSize:13,fontWeight:600,color:'var(--ink)',display:'block',marginBottom:8}}>{t.labelCadence}</label>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[['once',t.cadOnce],['weekdays',t.cadWeekdays],['daily',t.cadDaily],['weekly',t.cadWeekly]].map(([k,l])=>(
            <button type="button" key={k} onClick={()=>setCadence(k)} style={{
              padding:'8px 14px',borderRadius:999,
              border:`1px solid ${cadence===k?'var(--accent)':'var(--line)'}`,
              background: cadence===k ? 'var(--accent-soft)' : 'var(--card)',
              color: cadence===k ? 'var(--accent-3)' : 'var(--ink-2)',
              fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'
            }}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{padding:'28px clamp(20px,5vw,60px)',borderTop:'1px solid var(--line-2)',display:'flex',justifyContent:'space-between',alignItems:'center',color:'var(--ink-3)',fontSize:12.5,marginTop:'auto'}}>
      <span>Halastudy · Riyadh · 2026</span>
      <span style={{fontFamily:'var(--font-mono)',letterSpacing:'0.06em'}}>v0.1 · system preview</span>
    </footer>
  );
}

Object.assign(window, { Landing });
