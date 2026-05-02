// MTG Art Library — sketchy ideation strip
// Low-fi exploration: 3 different "Add Card" patterns, different
// printing-selector affordances, different status-color treatments.
// All hand-drawn vibe (Kalam font, simple shapes), one stop only.

const SAMPLE_NAMES_S = [
  "Sol Ring", "Counterspell", "Lightning Bolt",
  "Urza's Saga", "Brainstorm", "Path to Exile",
];

function SThumb({ w = 70, h = 90, label }) {
  return (
    <div className="s-thumb" style={{ width: w, height: h }}>
      {label || 'art'}
    </div>
  );
}

function SArrow({ dir = 'right' }) {
  const arrow = { right: '→', down: '↓', left: '←', curve: '↪' }[dir] || '→';
  return <span className="s-arrow">{arrow}</span>;
}

// ─── SKETCH 1: Add Card — modal ────────────────────────────────
function SketchAddModal() {
  return (
    <div className="sketch" style={{ padding: 14, width: 340, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        A · MODAL
      </div>
      <div style={{ background: 'rgba(0,0,0,0.06)', position: 'absolute', inset: 6, borderRadius: 3 }} />
      <div style={{ position: 'relative', background: '#fff', border: '1.5px solid #2a2a2a', borderRadius: 4, padding: 10, marginTop: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4>Add Card</h4>
          <span style={{ fontSize: 18 }}>✕</span>
        </div>
        <div className="s-box" style={{ marginBottom: 8 }}>type card name…</div>
        <div className="s-caption" style={{ marginBottom: 4 }}>top 5 printings (non-foil)</div>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <SThumb w={28} h={36} label="" />
            <div style={{ flex: 1 }}>
              <div className="s-line" style={{ width: '70%' }} />
              <div className="s-line" style={{ width: '40%', marginTop: 3, opacity: 0.5 }} />
            </div>
            {i === 4 && <span className="s-tag s-pill-yellow" style={{ fontSize: 11 }}>foil</span>}
          </div>
        ))}
      </div>
      <div className="s-scribble" style={{ bottom: 8, right: 10, transform: 'rotate(-3deg)' }}>
        focused but blocks bg
      </div>
    </div>
  );
}

// ─── SKETCH 2: Add Card — drawer ───────────────────────────────
function SketchAddDrawer() {
  return (
    <div className="sketch" style={{ padding: 0, width: 340, height: 380, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700, zIndex: 2 }}>
        B · DRAWER
      </div>
      {/* lib bg */}
      <div style={{ padding: 12, paddingTop: 24 }}>
        <div className="s-line" style={{ width: 80, marginBottom: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {[1,2,3,4,5,6].map(i => <SThumb key={i} w={'100%'} h={64} label="" />)}
        </div>
      </div>
      {/* drawer */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 170, background: '#fdfaf1', borderLeft: '2px solid #2a2a2a', padding: 10 }}>
        <h4 style={{ marginBottom: 8 }}>Add Card</h4>
        <div className="s-box" style={{ marginBottom: 6, fontSize: 12 }}>name…</div>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
            <SThumb w={20} h={26} label="" />
            <div style={{ flex: 1 }}>
              <div className="s-line" style={{ width: '70%', height: 1.2 }} />
              <div className="s-line" style={{ width: '50%', marginTop: 2, height: 1, opacity: 0.5 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="s-scribble" style={{ bottom: 6, left: 10, transform: 'rotate(-2deg)' }}>
        lib still visible →
      </div>
    </div>
  );
}

// ─── SKETCH 3: Add Card — top inline panel ─────────────────────
function SketchAddInline() {
  return (
    <div className="sketch" style={{ padding: 12, width: 340, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        C · INLINE
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="s-box" style={{ background: '#f3eedf', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>+ Add</span>
            <div className="s-box" style={{ flex: 1, fontSize: 12 }}>card name…</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ flex: 1 }}>
                <SThumb w={'100%'} h={56} label="" />
                <div className="s-line" style={{ width: '60%', marginTop: 3 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="s-caption" style={{ marginBottom: 6 }}>library below</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
          {[1,2,3,4,5,6,7,8].map(i => <SThumb key={i} w={'100%'} h={50} label="" />)}
        </div>
      </div>
      <div className="s-scribble" style={{ bottom: 6, right: 10, transform: 'rotate(2deg)' }}>
        always-on entry pt
      </div>
    </div>
  );
}

// ─── SKETCH 4: Build status row treatments ─────────────────────
function SketchStatusRows() {
  const Row = ({ tint, dot, label, name }) => (
    <div style={{
      background: tint,
      border: '1.5px solid #2a2a2a',
      borderRadius: 3,
      padding: '6px 8px',
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 4,
    }}>
      <span style={{ width: 10, height: 10, background: dot, borderRadius: '50%', border: '1.5px solid #2a2a2a' }} />
      <span className="mono" style={{ fontSize: 11, color: '#555' }}>1×</span>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ flex: 1 }} />
      <span className="s-tag" style={{ fontSize: 11 }}>{label}</span>
    </div>
  );
  return (
    <div className="sketch" style={{ padding: 12, width: 340, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        STATUS — tinted rows
      </div>
      <div style={{ marginTop: 6 }}>
        <Row tint="#d8efdb" dot="#3fa75e" label="cmm 366" name="Sol Ring" />
        <Row tint="#d8efdb" dot="#3fa75e" label="lea 161" name="Lightning Bolt" />
        <Row tint="#fbeac4" dot="#d6a52c" label="pick…" name="Counterspell" />
        <Row tint="#f4d2d2" dot="#c25a3a" label="missing" name="Urza's Saga" />
        <Row tint="#d8efdb" dot="#3fa75e" label="custom" name="Brainstorm" />
        <Row tint="#fbeac4" dot="#d6a52c" label="2 options" name="Path to Exile" />
        <Row tint="#f4d2d2" dot="#c25a3a" label="missing" name="Demonic Tutor" />
      </div>
      <div className="s-scribble" style={{ bottom: 6, right: 10, transform: 'rotate(-3deg)' }}>
        chosen ✓
      </div>
    </div>
  );
}

// ─── SKETCH 5: Job progress styles ────────────────────────────
function SketchJobs() {
  return (
    <div className="sketch" style={{ padding: 12, width: 340, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        JOB PROGRESS — inline
      </div>
      <div className="s-caption" style={{ marginBottom: 6 }}>chosen: inline on the row</div>
      <div className="s-box" style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SThumb w={28} h={36} label="" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Sol Ring</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <span style={{ textDecoration: 'line-through' }}>fetch</span>
              {' → '}
              <b>upscale…</b>
              {' → '}
              <span style={{ opacity: 0.4 }}>bleed</span>
              {' → '}
              <span style={{ opacity: 0.4 }}>save</span>
            </div>
            <div style={{ height: 4, background: '#eee', border: '1px solid #2a2a2a', marginTop: 4, borderRadius: 2 }}>
              <div style={{ width: '45%', height: '100%', background: '#7e6cd9' }} />
            </div>
          </div>
        </div>
      </div>
      <div className="s-caption" style={{ marginBottom: 6 }}>(rejected: toasts)</div>
      <div className="s-box s-dashed dim" style={{ marginBottom: 4, opacity: 0.6 }}>
        <span style={{ textDecoration: 'line-through' }}>floating toast in corner</span>
      </div>
      <div className="s-caption" style={{ marginBottom: 6 }}>(rejected: queue panel)</div>
      <div className="s-box s-dashed dim" style={{ opacity: 0.6 }}>
        <span style={{ textDecoration: 'line-through' }}>global jobs drawer</span>
      </div>
      <div className="s-scribble" style={{ bottom: 8, right: 10, transform: 'rotate(2deg)' }}>
        progress lives w/ the thing
      </div>
    </div>
  );
}

// ─── SKETCH 6: Library page layout (Steam-vibe vs list) ────────
function SketchLibLayouts() {
  return (
    <div className="sketch" style={{ padding: 12, width: 700, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        LIBRARY — grid (chosen) vs list
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 6 }}>
        {/* GRID */}
        <div>
          <div className="s-caption" style={{ marginBottom: 4 }}>grid · steam-style ✓</div>
          <div className="s-box" style={{ padding: 6 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span className="s-tag" style={{ fontSize: 11 }}>search…</span>
              <span style={{ flex: 1 }} />
              <span className="s-tag" style={{ fontSize: 11 }}>grid</span>
              <span className="s-tag s-pill-yellow" style={{ fontSize: 11 }}>+ add</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i}>
                  <SThumb w={'100%'} h={70} label="" />
                  <div className="s-line" style={{ width: '70%', marginTop: 3 }} />
                  <div className="s-line" style={{ width: '40%', marginTop: 2, opacity: 0.5 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* LIST */}
        <div>
          <div className="s-caption" style={{ marginBottom: 4 }}>list · scan-fast</div>
          <div className="s-box" style={{ padding: 6 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span className="s-tag" style={{ fontSize: 11 }}>search…</span>
              <span style={{ flex: 1 }} />
              <span className="s-tag s-pill-green" style={{ fontSize: 11 }}>list</span>
            </div>
            {SAMPLE_NAMES_S.map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1.2px solid rgba(0,0,0,0.15)' }}>
                <SThumb w={18} h={24} label="" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{n}</span>
                <span style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 11, color: '#666' }}>{1 + (i % 3)} prtg</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="s-scribble" style={{ bottom: 6, right: 14, transform: 'rotate(-2deg)' }}>
        toggle in toolbar
      </div>
    </div>
  );
}

// ─── SKETCH 7: Build screen overall layouts ───────────────────
function SketchBuildLayouts() {
  return (
    <div className="sketch" style={{ padding: 12, width: 700, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        BUILD — layouts considered
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 6 }}>
        <div>
          <div className="s-caption">A · paste then table</div>
          <div className="s-box" style={{ height: 110, marginBottom: 4 }}>paste here…</div>
          <div className="s-line" />
          <div className="s-box s-dashed">parsed table ↓</div>
          <div className="s-caption" style={{ marginTop: 4, fontSize: 12 }}>requires a step</div>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="s-caption">B · split (chosen ✓)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 4, height: 200 }}>
            <div className="s-box" style={{ height: '100%' }}>
              paste<br />stats:<br />🟢 8<br />🟡 2<br />🔴 1
            </div>
            <div className="s-box" style={{ height: '100%' }}>parsed rows…</div>
          </div>
          <div className="s-caption" style={{ marginTop: 4, fontSize: 12 }}>live parse · always visible</div>
          <div className="s-scribble" style={{ bottom: -2, left: 80, transform: 'rotate(-2deg)' }}>✓</div>
        </div>
        <div>
          <div className="s-caption">C · table dominant</div>
          <div className="s-box" style={{ height: 36, marginBottom: 4, fontSize: 12 }}>paste (collapsible) ▾</div>
          <div className="s-box" style={{ height: 168 }}>parsed rows… (full width)</div>
          <div className="s-caption" style={{ marginTop: 4, fontSize: 12 }}>hides the paste</div>
        </div>
      </div>
    </div>
  );
}

// ─── SKETCH 8: Card detail — page vs drawer ────────────────────
function SketchCardDetail() {
  return (
    <div className="sketch" style={{ padding: 12, width: 340, height: 380, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, background: '#fdfaf1', padding: '0 6px', fontWeight: 700 }}>
        CARD DETAIL — page ✓
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <SThumb w={90} h={120} label="art" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Sol Ring</div>
          <div className="s-caption">3 printings</div>
          <div className="mono" style={{ fontSize: 10, color: '#666' }}>sol_ring</div>
        </div>
      </div>
      <div className="s-line" style={{ margin: '10px 0' }} />
      <div className="s-caption" style={{ marginBottom: 4 }}>printings</div>
      {['cmm 366 · default ★', 'lea 270', 'custom · futurama'].map((p, i) => (
        <div key={i} className="s-box" style={{ marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          <SThumb w={26} h={34} label="" />
          <span style={{ fontWeight: 600 }}>{p}</span>
          <span style={{ flex: 1 }} />
          <span className="s-tag" style={{ fontSize: 10 }}>mirror</span>
        </div>
      ))}
      <div className="s-caption" style={{ marginTop: 6, fontSize: 12 }}>each row → set default · re-process · change bleed · delete</div>
      <div className="s-scribble" style={{ bottom: 6, right: 10, transform: 'rotate(-2deg)' }}>
        own URL · /card/sol_ring
      </div>
    </div>
  );
}

window.SketchAddModal = SketchAddModal;
window.SketchAddDrawer = SketchAddDrawer;
window.SketchAddInline = SketchAddInline;
window.SketchStatusRows = SketchStatusRows;
window.SketchJobs = SketchJobs;
window.SketchLibLayouts = SketchLibLayouts;
window.SketchBuildLayouts = SketchBuildLayouts;
window.SketchCardDetail = SketchCardDetail;
