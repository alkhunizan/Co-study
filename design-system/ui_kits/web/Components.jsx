/* Reusable primitives. Keep flat, no styles object that clashes. */

function Icon({ name, size = 20, stroke = 1.5, className = '', style = {} }) {
  // Inline a tiny stroke-only set; matches Lucide vibe (1.5px round).
  const paths = {
    'camera':     <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="4"/></>,
    'camera-off': <><line x1="3" y1="3" x2="21" y2="21"/><path d="M22 17V9a2 2 0 0 0-2-2h-3L14.5 4H10"/><path d="M2 9v9a2 2 0 0 0 2 2h12"/><path d="M14 14a2 2 0 1 1-3-2"/></>,
    'mic':        <><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/></>,
    'mic-off':    <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2"/><path d="M19 10v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
    'message':    <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    'board':      <><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>,
    'send':       <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    'share':      <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>,
    'moon':       <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    'sun':        <><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7" y2="7"/><line x1="17" y1="17" x2="19" y2="19"/><line x1="5" y1="19" x2="7" y2="17"/><line x1="17" y1="7" x2="19" y2="5"/></>,
    'play':       <><polygon points="6 4 20 12 6 20 6 4"/></>,
    'pause':      <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    'reset':      <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>,
    'plus':       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    'check':      <><polyline points="20 6 9 17 4 12"/></>,
    'x':          <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    'arrow-r':    <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    'arrow-d':    <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    'lock':       <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    'cloud-rain': <><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></>,
    'trees':      <><path d="M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19h6"/><path d="M16 19v3"/><path d="M14 7h.01"/><path d="M14 17a3 3 0 0 0 3-3"/><path d="M22 11a5 5 0 0 0-5-5"/></>,
    'flame':      <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></>,
    'coffee':     <><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></>,
    'waves':      <><path d="M2 6c.6.5 1.2 1 2.5 1S6.5 5.5 8 5.5 9.6 7 11 7s2-1.5 3.5-1.5S16.5 7 18 7s2-1.5 3.5-1.5"/><path d="M2 12c.6.5 1.2 1 2.5 1s1.6-1.5 3.5-1.5S9.6 13 11 13s2-1.5 3.5-1.5S16.5 13 18 13s2-1.5 3.5-1.5"/><path d="M2 18c.6.5 1.2 1 2.5 1s1.6-1.5 3.5-1.5S9.6 19 11 19s2-1.5 3.5-1.5S16.5 19 18 19s2-1.5 3.5-1.5"/></>,
    'volume':     <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>,
    'book':       <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    'briefcase':  <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    'utensils':   <><path d="M3 2v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2"/><line x1="5" y1="11" x2="5" y2="22"/><path d="M17 2v20"/><path d="M21 9a4 4 0 0 0-4-4"/></>,
    'walk':       <><circle cx="13" cy="4" r="2"/><path d="M4 22l5-10 4 4 4-2"/><path d="M9 12l-1 5 4 5"/></>,
    'calendar':   <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    'clock':      <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    'circle':     <><circle cx="12" cy="12" r="9"/></>,
  };
  const p = paths[name] || null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         className={className} style={style} aria-hidden="true">{p}</svg>
  );
}

function Button({ variant = 'primary', size = 'md', children, onClick, disabled, type = 'button', icon, full, style = {} }) {
  const base = {
    fontFamily: 'inherit',
    fontWeight: 600,
    borderRadius: 999,
    border: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'transform 220ms cubic-bezier(0.32,0.72,0.32,1), box-shadow 220ms cubic-bezier(0.32,0.72,0.32,1), background 120ms, color 120ms',
    opacity: disabled ? 0.45 : 1,
    width: full ? '100%' : 'auto',
    whiteSpace: 'nowrap',
    ...style,
  };
  const sizes = {
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '12px 22px', fontSize: 15 },
    lg: { padding: '16px 28px', fontSize: 16 },
  };
  const variants = {
    primary:   { background: 'var(--accent)', color: 'var(--ink)', boxShadow: 'var(--sh-lamp)' },
    secondary: { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-strong)' },
    ghost:     { background: 'var(--accent-soft)', color: 'var(--accent-3)' },
    danger:    { background: 'var(--danger)', color: '#fff' },
    link:      { background: 'transparent', color: 'var(--accent-3)', padding: '6px 8px' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseDown={(e)=>e.currentTarget.style.transform='scale(0.98)'}
      onMouseUp={(e)=>e.currentTarget.style.transform=''}
      onMouseLeave={(e)=>e.currentTarget.style.transform=''}
      style={{ ...base, ...sizes[size], ...variants[variant] }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

function IconBtn({ icon, onClick, active, title, danger, size = 36 }) {
  const styles = {
    width: size, height: size, borderRadius: 12, border: '1px solid var(--line)',
    background: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--card)',
    color: danger ? '#fff' : active ? 'var(--ink)' : 'var(--ink)',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 120ms', borderColor: active ? 'transparent' : 'var(--line)',
  };
  return <button title={title} onClick={onClick} style={styles}><Icon name={icon} size={16}/></button>;
}

function Input({ label, hint, error, value, onChange, placeholder, type = 'text', forceLtr, mono, suffix }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {label && <label style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{label}</label>}
      <div style={{position:'relative'}}>
        <input
          type={type} value={value || ''} placeholder={placeholder}
          onChange={(e)=>onChange && onChange(e.target.value)}
          onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
          dir={forceLtr ? 'ltr' : undefined}
          style={{
            width:'100%', padding:'12px 16px', borderRadius:16,
            border:`1px solid ${error ? 'var(--danger)' : focus ? 'var(--accent)' : 'var(--line)'}`,
            background: focus || value ? 'var(--card)' : 'var(--inset)',
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            letterSpacing: mono ? '0.18em' : 'normal',
            fontSize: mono ? 16 : 15, color:'var(--ink)',
            boxShadow: focus ? '0 0 0 3px var(--accent-glow)' : 'none',
            transition:'all 120ms', outline:'none',
            textAlign: forceLtr ? 'start' : undefined,
          }}/>
      </div>
      {hint && !error && <span style={{fontSize:12,color:'var(--ink-2)'}}>{hint}</span>}
      {error && <span style={{fontSize:12,color:'var(--danger)'}}>{error}</span>}
    </div>
  );
}

function Pill({ children, tone = 'line', icon, dot, size = 'md' }) {
  const tones = {
    line:    { background:'var(--card)', border:'1px solid var(--line)', color:'var(--ink-2)' },
    accent:  { background:'var(--accent-soft)', color:'var(--accent-3)', fontWeight:600 },
    solid:   { background:'var(--accent)', color:'var(--ink)', fontWeight:600 },
    success: { background:'var(--success-soft)', color:'#3F6A41' },
    danger:  { background:'var(--danger-soft)', color:'#8B3D31' },
    warn:    { background:'var(--warn-soft)', color:'#7A5A2A' },
    live:    { background:'var(--card)', border:'1px solid var(--line)', color:'var(--ink-2)' },
  };
  const sz = size === 'sm' ? { padding:'4px 10px', fontSize:11.5 } : { padding:'6px 12px', fontSize:13 };
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,borderRadius:999,fontWeight:500,...sz,...tones[tone]}}>
      {dot && <span style={{width:8,height:8,borderRadius:'50%',background:dot,
        animation: tone==='live' ? 'hcPulse 1.6s infinite' : 'none'}}/>}
      {icon && <Icon name={icon} size={12}/>}
      {children}
    </span>
  );
}

function Card({ children, padding = 24, hover, featured, dashed, style = {} }) {
  const base = {
    background: dashed ? 'transparent' : 'var(--card)',
    border: `1px ${dashed ? 'dashed' : 'solid'} ${dashed ? 'var(--line-strong)' : 'var(--line)'}`,
    borderRadius: 24, padding,
    boxShadow: dashed ? 'none' : 'var(--sh-2)',
    transition: 'all 220ms cubic-bezier(0.32,0.72,0.32,1)',
  };
  if (featured) {
    base.background = 'linear-gradient(180deg, rgba(224,176,139,0.18) 0%, rgba(224,176,139,0.06) 100%)';
    base.borderColor = 'rgba(224,176,139,0.4)';
  }
  return <div style={{...base, ...style}}>{children}</div>;
}

function Avatar({ name, presence, size = 36 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const colors = { online: 'var(--success)', away: 'var(--ink-3)', busy: 'var(--danger)' };
  return (
    <span style={{
      width:size, height:size, borderRadius:'50%',
      background:'var(--accent-soft)', color:'var(--accent-3)',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontWeight:700, fontFamily:'var(--font-display)', fontSize: size*0.42,
      position:'relative', flexShrink:0
    }}>
      {initial}
      {presence && <span style={{
        position:'absolute', insetBlockEnd:-1, insetInlineEnd:-1,
        width:size*0.28, height:size*0.28, borderRadius:'50%',
        background:colors[presence], border:'2px solid var(--card)'
      }}/>}
    </span>
  );
}

function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:2,background:'var(--inset)',padding:4,borderRadius:999,fontSize:12,fontWeight:600}}>
      {['EN','AR'].map(L => {
        const v = L.toLowerCase();
        const on = lang === v;
        return (
          <button key={L} onClick={()=>setLang(v)}
            style={{padding:'4px 12px',borderRadius:999,border:0,cursor:'pointer',background: on ? 'var(--card)' : 'transparent',color: on ? 'var(--accent-3)' : 'var(--ink-2)',boxShadow: on ? 'var(--sh-1)' : 'none',fontWeight:600,fontSize:12,fontFamily:'Inter, system-ui, sans-serif'}}>
            {L}
          </button>
        );
      })}
    </div>
  );
}

function Logo({ size = 18 }) {
  return (
    <span style={{fontFamily:'var(--font-display)',fontSize:size,fontWeight:600,color:'var(--ink)',display:'inline-flex',alignItems:'center',gap:10,letterSpacing:'-0.01em'}}>
      <span style={{width:size+8,height:size+8,borderRadius:7,background:'var(--accent)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--ink)',fontWeight:800,fontSize:size*0.66,fontFamily:'Inter, sans-serif'}}>H</span>
      Hala<em style={{fontStyle:'italic',color:'var(--accent-3)',fontFamily:'var(--font-display)',fontWeight:500}}>study</em>
    </span>
  );
}

Object.assign(window, { Icon, Button, IconBtn, Input, Pill, Card, Avatar, LangSwitch, Logo });
