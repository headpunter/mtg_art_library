// MTG Art Library — mid-fi screens
// Library (grid + list), Build view, Card detail, Add Card drawer.
// Dark Steam/itch-style aesthetic. Image-forward, image placeholders use
// monospace stripe pattern.

const SAMPLE_CARDS = [
  { name: "Sol Ring", slug: "sol_ring", printings: 3, def: "cmm 366", tags: ["futurama"] },
  { name: "Counterspell", slug: "counterspell", printings: 2, def: "cmm 081" },
  { name: "Lightning Bolt", slug: "lightning_bolt", printings: 4, def: "lea 161" },
  { name: "Brainstorm", slug: "brainstorm", printings: 1, def: "ema 040" },
  { name: "Path to Exile", slug: "path_to_exile", printings: 2, def: "cmr 050" },
  { name: "Demonic Tutor", slug: "demonic_tutor", printings: 1, def: "lea 109", tags: ["mpcfill"] },
  { name: "Swords to Plowshares", slug: "swords_to_plowshares", printings: 2, def: "ema 030" },
  { name: "Cyclonic Rift", slug: "cyclonic_rift", printings: 1, def: "rtr 049" },
  { name: "Mana Drain", slug: "mana_drain", printings: 1, def: "ima 042" },
  { name: "Smothering Tithe", slug: "smothering_tithe", printings: 1, def: "rna 022" },
  { name: "Rhystic Study", slug: "rhystic_study", printings: 2, def: "c18 080", processing: { stage: 'upscale', pct: 60 } },
  { name: "Urza's Saga", slug: "urzas_saga", printings: 1, def: "mh2 259" },
];

function ArtPlaceholder({ tag, set }) {
  return (
    <div className="art">
      <span>art · {set || 'placeholder'}</span>
      {tag && <div className="tag-strip"><span className="t">{tag}</span></div>}
    </div>
  );
}

function LibraryCard({ c }) {
  return (
    <div className={"card" + (c.processing ? " processing" : "")}>
      <div className="art" style={{ position: 'relative' }}>
        <span>{c.def}</span>
        {c.printings > 1 && <div className="badge">×{c.printings}</div>}
        {(c.tags || []).length > 0 && (
          <div className="tag-strip">
            {c.tags.map(t => <span key={t} className="t">{t}</span>)}
          </div>
        )}
        {c.processing && (
          <div className="processing-pill">
            <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            upscaling…
          </div>
        )}
        {c.processing && <div className="progress"><i style={{ width: c.processing.pct + '%' }} /></div>}
      </div>
      <div className="meta">
        <div className="name">{c.name}</div>
        <div className="sub">
          <span>{c.printings} printing{c.printings > 1 ? 's' : ''}</span>
          {c.tags && c.tags.length > 0 && <span>· custom</span>}
        </div>
      </div>
    </div>
  );
}

function LibraryGrid() {
  return (
    <div className="grid">
      {SAMPLE_CARDS.map(c => <LibraryCard key={c.slug} c={c} />)}
    </div>
  );
}

function LibraryList() {
  return (
    <div className="list">
      <div className="row head">
        <div></div>
        <div>Card</div>
        <div>Default printing</div>
        <div>Printings</div>
        <div>Added</div>
        <div></div>
      </div>
      {SAMPLE_CARDS.slice(0, 9).map((c, i) => (
        <div className="row" key={c.slug}>
          <div className="thumb-mini" />
          <div>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{c.slug}</div>
          </div>
          <div className="mono" style={{ color: 'var(--ink-2)' }}>{c.def}</div>
          <div className="pct">{c.printings}</div>
          <div className="pct">2026-04-2{i}</div>
          <div className="dim">›</div>
        </div>
      ))}
    </div>
  );
}

function LibraryToolbar({ view, setView, onAdd }) {
  return (
    <div className="toolbar">
      <div className="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input className="input" placeholder="Search 142 cards…" />
      </div>
      <div className="seg" role="tablist">
        <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Grid
        </button>
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          List
        </button>
      </div>
      <div className="seg">
        <button className="on">Sort: Recent</button>
      </div>
      <div style={{ flex: 1 }} />
      <button className="btn primary" onClick={onAdd}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Card
      </button>
    </div>
  );
}

function Sidebar({ active }) {
  return (
    <aside className="sidebar">
      <div className="section-label">Library</div>
      <div className={"nav-item" + (active === 'all' ? ' active' : '')}>All cards <span className="count">142</span></div>
      <div className="nav-item">Recently added <span className="count">12</span></div>
      <div className="nav-item">Multiple printings <span className="count">28</span></div>
      <div className="nav-item">Custom art <span className="count">19</span></div>
      <div className="section-label">Tags</div>
      <div className="nav-item"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#c66', display: 'inline-block' }} /> futurama <span className="count">14</span></div>
      <div className="nav-item"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#69c', display: 'inline-block' }} /> mpcfill <span className="count">5</span></div>
      <div className="section-label">System</div>
      <div className="nav-item">Jobs <span className="count">1</span></div>
      <div className="nav-item">Settings</div>
    </aside>
  );
}

function AppBar({ tab, setTab }) {
  return (
    <div className="appbar">
      <div className="logo">
        <span className="logo-mark">⌬</span>
        <span>art library</span>
      </div>
      <div className="tabs">
        <div className={"tab" + (tab === 'library' ? ' active' : '')} onClick={() => setTab('library')}>Library</div>
        <div className={"tab" + (tab === 'build' ? ' active' : '')} onClick={() => setTab('build')}>Build</div>
      </div>
      <div className="spacer" />
      <span className="meta">142 cards · 800 dpi · 2192×2992</span>
    </div>
  );
}

// ─── Add Card drawer ─────────────────────────────────────────────
const SCRY_RESULTS = [
  { name: "Sol Ring", set: "Commander Masters", code: "cmm", num: "366", price: "$1.20" },
  { name: "Sol Ring", set: "Limited Edition Alpha", code: "lea", num: "270", price: "$5,800.00" },
  { name: "Sol Ring", set: "Commander Legends", code: "cmr", num: "541", price: "$12.50", foil: true },
  { name: "Sol Ring", set: "Double Masters 2022", code: "2x2", num: "315", price: "$2.40" },
  { name: "Sol Ring", set: "Revised Edition", code: "3ed", num: "262", price: "$3.80" },
];

function AddDrawer({ onClose }) {
  return (
    <div className="add-drawer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Add Card</div>
        <button className="btn ghost icon" onClick={onClose}>✕</button>
      </div>
      <div className="seg" style={{ width: '100%' }}>
        <button className="on" style={{ flex: 1 }}>From Scryfall</button>
        <button style={{ flex: 1 }}>From file</button>
      </div>
      <input className="input" defaultValue="Sol Ring" />
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginTop: 4 }}>
        Top 5 printings · non-foil first
      </div>
      {SCRY_RESULTS.map((r, i) => (
        <div key={i} className={"scry-result" + (r.foil ? ' foil' : '')}>
          <div className="pthumb" />
          <div className="info">
            <div className="pname">{r.name}</div>
            <div className="pset">{r.set} · <span style={{ color: 'var(--ink-2)' }}>{r.code} {r.num}</span></div>
            <div className="pprice">{r.price}</div>
          </div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{
        background: 'var(--bg-3)', border: '1px solid var(--line)',
        padding: 10, borderRadius: 6, fontSize: 11, color: 'var(--ink-3)',
        fontFamily: 'var(--mono)', lineHeight: 1.5,
      }}>
        click a printing to start:<br />
        <span style={{ color: 'var(--ok)' }}>fetch</span> →
        upscale 4× →
        bleed (mirror) →
        save
      </div>
    </div>
  );
}

// ─── Build view ─────────────────────────────────────────────────
const SAMPLE_DECK = `1 Sol Ring
1x Lightning Bolt
1 Counterspell (cmm) 081
1 Brainstorm
1 Path to Exile
1 Demonic Tutor
1 Mana Drain
1 Cyclonic Rift
4 Force of Will
1 Urza's Saga
1 Smothering Tithe
1 Rhystic Study
2 Swords to Plowshares
// Lands omitted for brevity`;

const PARSED_ROWS = [
  { qty: 1, name: "Sol Ring",            status: 'ok',   sel: { code: 'cmm', num: '366' }, alts: 3 },
  { qty: 1, name: "Lightning Bolt",      status: 'ok',   sel: { code: 'lea', num: '161' }, alts: 4 },
  { qty: 1, name: "Counterspell",        status: 'warn', sel: { code: 'cmm', num: '081' }, alts: 2, hint: 'pinned by decklist' },
  { qty: 1, name: "Brainstorm",          status: 'ok',   sel: { code: 'ema', num: '040' }, alts: 1 },
  { qty: 1, name: "Path to Exile",       status: 'warn', sel: { code: 'cmr', num: '050' }, alts: 2 },
  { qty: 1, name: "Demonic Tutor",       status: 'ok',   sel: { code: 'lea', num: '109' }, alts: 1, tag: 'mpcfill' },
  { qty: 1, name: "Mana Drain",          status: 'ok',   sel: { code: 'ima', num: '042' }, alts: 1 },
  { qty: 1, name: "Cyclonic Rift",       status: 'ok',   sel: { code: 'rtr', num: '049' }, alts: 1 },
  { qty: 4, name: "Force of Will",       status: 'bad',  sel: null, alts: 0 },
  { qty: 1, name: "Urza's Saga",         status: 'ok',   sel: { code: 'mh2', num: '259' }, alts: 1 },
  { qty: 1, name: "Smothering Tithe",    status: 'ok',   sel: { code: 'rna', num: '022' }, alts: 1 },
  { qty: 1, name: "Rhystic Study",       status: 'warn', sel: { code: 'c18', num: '080' }, alts: 2, processing: 'upscaling…' },
  { qty: 2, name: "Swords to Plowshares",status: 'ok',   sel: { code: 'ema', num: '030' }, alts: 2 },
];

function PrintingSelectorDefault({ row }) {
  if (!row.sel) {
    return (
      <button className="printing-select missing">
        <span>+ pick from Scryfall</span>
        <span>›</span>
      </button>
    );
  }
  return (
    <div className="printing-select">
      <span className="set-code">{row.sel.code}</span>
      <span style={{ flex: 1, color: 'var(--ink)' }}>{row.sel.num}</span>
      {row.alts > 1 && <span style={{ color: 'var(--ink-3)' }}>{row.alts} ▾</span>}
    </div>
  );
}

// Variant A: tile strip — small thumbs side by side, click to choose
function PrintingSelectorTiles({ row }) {
  if (!row.sel) {
    return (
      <button className="printing-select missing">
        <span>+ pick</span>
      </button>
    );
  }
  const n = Math.min(row.alts || 1, 4);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{
          width: 22, height: 30, borderRadius: 3,
          background: 'repeating-linear-gradient(135deg, #2a3140 0 3px, #242a36 3px 6px)',
          border: i === 0 ? '1.5px solid var(--accent)' : '1px solid var(--line-2)',
          position: 'relative', cursor: 'pointer',
        }}>
          {i === 0 && <span style={{
            position: 'absolute', bottom: -1, right: -1,
            background: 'var(--accent)', color: '#0c0d10',
            width: 9, height: 9, borderRadius: '50%',
            fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>★</span>}
        </div>
      ))}
      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', alignSelf: 'center', marginLeft: 4 }}>
        {row.sel.code} {row.sel.num}
      </span>
    </div>
  );
}

// Variant B: stepper — < cmm 366 (1/3) >
function PrintingSelectorStepper({ row }) {
  if (!row.sel) {
    return <button className="printing-select missing"><span>+ pick</span></button>;
  }
  return (
    <div className="printing-select" style={{ padding: '2px 6px' }}>
      <button className="btn ghost icon" style={{ width: 20, height: 20, padding: 0 }}>‹</button>
      <span className="set-code">{row.sel.code}</span>
      <span style={{ color: 'var(--ink)' }}>{row.sel.num}</span>
      <span style={{ color: 'var(--ink-3)', marginLeft: 'auto' }}>1/{row.alts}</span>
      <button className="btn ghost icon" style={{ width: 20, height: 20, padding: 0 }}>›</button>
    </div>
  );
}

// Variant C: thumbnail-led — show a single mini-thumb + set/num
function PrintingSelectorThumb({ row }) {
  if (!row.sel) {
    return <button className="printing-select missing"><span>+ pick from Scryfall</span></button>;
  }
  return (
    <div className="printing-select" style={{ padding: '3px 6px' }}>
      <div style={{
        width: 22, height: 30, borderRadius: 3,
        background: 'repeating-linear-gradient(135deg, #2a3140 0 3px, #242a36 3px 6px)',
        border: '1px solid var(--line-2)', flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink)' }}>{row.sel.code} {row.sel.num}</div>
        {row.alts > 1 && <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)' }}>+{row.alts - 1} more</div>}
      </div>
      <span style={{ color: 'var(--ink-3)' }}>▾</span>
    </div>
  );
}

function pickSelector(variant, row) {
  switch (variant) {
    case 'tiles': return <PrintingSelectorTiles row={row} />;
    case 'stepper': return <PrintingSelectorStepper row={row} />;
    case 'thumb': return <PrintingSelectorThumb row={row} />;
    default: return <PrintingSelectorDefault row={row} />;
  }
}

function ParsedRow({ row, variant }) {
  return (
    <tr className={row.status}>
      <td className="qty">{row.qty}×</td>
      <td className="name">
        <span className="status-dot" />
        {row.name}
        {row.tag && <span style={{
          marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 9,
          background: 'var(--bg-4)', color: 'var(--ink-2)',
          padding: '1px 5px', borderRadius: 3,
        }}>{row.tag}</span>}
        {row.hint && <div className="sub">{row.hint}</div>}
        {row.processing && (
          <div className="job-strip" style={{ marginTop: 4 }}>
            <span className="stage done">fetch</span><span className="sep">→</span>
            <span className="stage active">upscale…</span><span className="sep">→</span>
            <span className="stage todo">bleed</span><span className="sep">→</span>
            <span className="stage todo">save</span>
          </div>
        )}
      </td>
      <td className="printing-cell">
        {pickSelector(variant, row)}
      </td>
      <td className="action-cell">
        {row.status === 'bad' ? (
          <button className="btn sm primary">Find</button>
        ) : (
          <button className="btn sm ghost">Edit</button>
        )}
      </td>
    </tr>
  );
}

function BuildView({ selectorVariant }) {
  const okCount = PARSED_ROWS.filter(r => r.status === 'ok').length;
  const warnCount = PARSED_ROWS.filter(r => r.status === 'warn').length;
  const badCount = PARSED_ROWS.filter(r => r.status === 'bad').length;
  return (
    <div className="build-wrap">
      <div className="paste-pane">
        <h3>Decklist</h3>
        <textarea className="textarea" defaultValue={SAMPLE_DECK} style={{ minHeight: 220 }} />
        <div className="paste-stats">
          <div className="stat"><div className="num">{PARSED_ROWS.length}</div><div className="lbl">unique</div></div>
          <div className="stat ok"><div className="num">{okCount}</div><div className="lbl">in lib</div></div>
          <div className="stat warn"><div className="num">{warnCount}</div><div className="lbl">pick</div></div>
          <div className="stat bad"><div className="num">{badCount}</div><div className="lbl">missing</div></div>
        </div>
        <button className="btn">Re-parse</button>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)',
          padding: '8px 0', borderTop: '1px dashed var(--line)',
        }}>
          parser handles: <br />
          <span style={{ color: 'var(--ink-2)' }}>1 Sol Ring</span><br />
          <span style={{ color: 'var(--ink-2)' }}>1x Sol Ring</span><br />
          <span style={{ color: 'var(--ink-2)' }}>Sol Ring</span><br />
          <span style={{ color: 'var(--ink-2)' }}>1 Sol Ring (cmm) 366</span><br />
          <span style={{ color: 'var(--ink-4)' }}>// comments skipped</span>
        </div>
      </div>
      <div className="parsed-pane" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="parsed-table">
            <thead>
              <tr>
                <th style={{ width: 50, textAlign: 'right' }}>Qty</th>
                <th>Card</th>
                <th>Printing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {PARSED_ROWS.map((r, i) => <ParsedRow key={i} row={r} variant={selectorVariant} />)}
            </tbody>
          </table>
        </div>
        <div className="build-foot">
          <div className="summary">
            <div className="pair"><span className="lbl">total</span><span className="val">17</span></div>
            <div className="pair"><span className="lbl">unique</span><span className="val">{PARSED_ROWS.length}</span></div>
            <div className="pair"><span className="lbl" style={{ color: 'var(--ok)' }}>ok</span><span className="val" style={{ color: 'var(--ok)' }}>{okCount}</span></div>
            <div className="pair"><span className="lbl" style={{ color: 'var(--warn)' }}>pick</span><span className="val" style={{ color: 'var(--warn)' }}>{warnCount}</span></div>
            <div className="pair"><span className="lbl" style={{ color: 'var(--bad)' }}>miss</span><span className="val" style={{ color: 'var(--bad)' }}>{badCount}</span></div>
          </div>
          <div className="spacer" />
          <div className="format-pick">
            <button className="on">MPC PNG</button>
            <button>Autofill XML</button>
            <button>9-up PDF</button>
          </div>
          <button className="btn primary" disabled={badCount > 0}>
            {badCount > 0 ? `Fix ${badCount} first` : 'Build →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card detail ────────────────────────────────────────────────
function CardDetail() {
  const printings = [
    { id: "cmm_366", set: "Commander Masters", code: "cmm", num: "366", bleed: "mirror", source: "scryfall", added: "2026-04-12", isDefault: true },
    { id: "lea_270", set: "Limited Edition Alpha", code: "lea", num: "270", bleed: "mirror", source: "scryfall", added: "2026-03-30" },
    { id: "custom_futurama", set: "—", code: "custom", num: "futurama", bleed: "edge", source: "file", added: "2026-04-22", tag: "futurama" },
  ];
  return (
    <div className="detail">
      <div className="left">
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, fontFamily: 'var(--mono)' }}>
          ‹ Library / All cards
        </div>
        <div className="detail-art">art · cmm 366 (default)</div>
        <h2>Sol Ring</h2>
        <div className="slug">slug: sol_ring · 3 printings</div>
        <div className="kv">
          <div className="k">type</div><div className="v">Artifact</div>
          <div className="k">cmc</div><div className="v">1</div>
          <div className="k">added</div><div className="v">2026-03-30</div>
          <div className="k">last edit</div><div className="v">2026-04-22</div>
          <div className="k">disk</div><div className="v">31.4 MB</div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 6 }}>
          <button className="btn sm">+ Add printing</button>
          <button className="btn sm ghost">Delete card</button>
        </div>
      </div>
      <div className="right">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>
            Printings
          </h3>
          <div className="seg">
            <button className="on">Cards</button>
            <button>Compact</button>
          </div>
        </div>
        {printings.map(p => (
          <div key={p.id} className={"printing-card" + (p.isDefault ? ' is-default' : '')}>
            <div className="pthumb" />
            <div className="pmeta">
              <div className="pname">
                {p.set} {p.isDefault && <span className="is-default-pill">default</span>}
              </div>
              <div className="pdetails">
                <span className="ptag">{p.code} {p.num}</span>
                <span>bleed: {p.bleed}</span>
                <span>src: {p.source}</span>
                {p.tag && <span className="ptag" style={{ color: 'var(--accent)' }}>#{p.tag}</span>}
                <span>added {p.added}</span>
              </div>
            </div>
            <div className="pactions">
              {!p.isDefault && <button className="btn sm">Set default</button>}
              <button className="btn sm ghost">Bleed ▾</button>
              <button className="btn sm ghost">Re-process</button>
              <button className="btn sm ghost" style={{ color: 'var(--bad)' }}>Delete</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, padding: 14, border: '1px dashed var(--line-2)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Add another printing
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn">+ From Scryfall</button>
            <button className="btn">+ From file</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wrappers (fixed-size frames for the design canvas) ─────────
function MidLibraryGrid({ withDrawer }) {
  return (
    <div className="mid" style={{ width: 1180, height: 760, position: 'relative' }}>
      <AppBar tab="library" setTab={() => {}} />
      <div className="body">
        <Sidebar active="all" />
        <div className="main">
          <LibraryToolbar view="grid" setView={() => {}} />
          <LibraryGrid />
        </div>
      </div>
      {withDrawer && <AddDrawer onClose={() => {}} />}
    </div>
  );
}

function MidLibraryList() {
  return (
    <div className="mid" style={{ width: 1180, height: 760 }}>
      <AppBar tab="library" setTab={() => {}} />
      <div className="body">
        <Sidebar active="all" />
        <div className="main">
          <LibraryToolbar view="list" setView={() => {}} />
          <LibraryList />
        </div>
      </div>
    </div>
  );
}

function MidBuild({ selectorVariant }) {
  return (
    <div className="mid" style={{ width: 1180, height: 760 }}>
      <AppBar tab="build" setTab={() => {}} />
      <div className="body" style={{ display: 'block' }}>
        <BuildView selectorVariant={selectorVariant} />
      </div>
    </div>
  );
}

function MidCardDetail() {
  return (
    <div className="mid" style={{ width: 1180, height: 760 }}>
      <AppBar tab="library" setTab={() => {}} />
      <div className="body">
        <CardDetail />
      </div>
    </div>
  );
}

// ─── Page flow ──────────────────────────────────────────────────
function PageFlow() {
  return (
    <div className="flow" style={{ width: 900, height: 540 }}>
      <h2>Page flow</h2>
      <div className="flow-grid">
        <div>
          <div className="flow-node">
            <div className="ttl">Library (tab)</div>
            <div className="desc">/library<br/>grid · list toggle<br/>search · filter by tag<br/>+ Add Card → drawer</div>
          </div>
          <div className="flow-arrow">↓ click a card</div>
          <div className="flow-node">
            <div className="ttl">Card detail</div>
            <div className="desc">/card/&lt;slug&gt;<br/>printings list<br/>set default · re-process<br/>change bleed · delete</div>
          </div>
        </div>
        <div>
          <div className="flow-node" style={{ borderColor: 'var(--accent-dim)' }}>
            <div className="ttl">Add Card drawer</div>
            <div className="desc">Slides from right<br/>Tabs: Scryfall · File<br/>Top 5 printings, foil dimmed<br/>Click → background job</div>
          </div>
          <div className="flow-arrow">↓ job</div>
          <div className="flow-node">
            <div className="ttl">Inline progress</div>
            <div className="desc">fetch → upscale → bleed → save<br/>shown on the card tile / row<br/>polling /jobs/&lt;id&gt;</div>
          </div>
        </div>
        <div>
          <div className="flow-node">
            <div className="ttl">Build (tab)</div>
            <div className="desc">/build<br/>paste decklist<br/>parsed table (tinted rows)<br/>summary + format picker</div>
          </div>
          <div className="flow-arrow">↓ red row</div>
          <div className="flow-node">
            <div className="ttl">Inline pick (red)</div>
            <div className="desc">expands within the row<br/>top 5 Scryfall printings<br/>click → ingest job → row turns 🟢</div>
          </div>
          <div className="flow-arrow">↓ Build</div>
          <div className="flow-node" style={{ borderColor: 'var(--ok)' }}>
            <div className="ttl">Build output</div>
            <div className="desc">format: PNG / XML / PDF<br/>progress + download link<br/>writes to ~/exports/&lt;deckname&gt;/</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
        URL conventions: /library  /library?view=list  /card/&lt;slug&gt;  /build
      </div>
    </div>
  );
}

// ─── Components doc ─────────────────────────────────────────────
const COMPONENTS = [
  { name: "<AppBar>", where: "global", desc: "Logo, Library/Build tabs, library meta. Sticky top." },
  { name: "<Sidebar>", where: "library tab", desc: "Filters: All, Recently added, Multiple printings, Custom, plus tag list. Counts per filter." },
  { name: "<LibraryToolbar>", where: "library tab", desc: "Search, view toggle (Grid/List), Sort, + Add Card." },
  { name: "<LibraryCard>", where: "grid view", desc: "Steam-style tile: full-bleed art, ×N printings badge, custom-art tag. Hover lift. Processing state shows progress strip + 'upscaling…'." },
  { name: "<LibraryRow>", where: "list view", desc: "Mini thumb, name, default printing, count, added date." },
  { name: "<AddDrawer>", where: "right side", desc: "Tabs: Scryfall / File. Search + top-5 result cards (foil dimmed). Click → background job." },
  { name: "<CardDetailPage>", where: "/card/<slug>", desc: "Left: hero art + meta. Right: printings list + add panel." },
  { name: "<PrintingCard>", where: "card detail", desc: "Thumb + set/num + bleed + source + tag + actions. Default is highlighted." },
  { name: "<DeckPaste>", where: "build tab", desc: "Big textarea, live parse, stat tiles (unique / ok / pick / missing), format hints." },
  { name: "<ParsedTable>", where: "build tab", desc: "Sticky header, tinted rows by status, status dot, qty, name, printing selector, edit/find action." },
  { name: "<PrintingSelector>", where: "table cell", desc: "Default: pill with set-code chip + collector number + count. 4 tweakable variants exposed (Pill / Tiles / Stepper / Thumb-led)." },
  { name: "<JobStrip>", where: "anywhere a job runs", desc: "fetch → upscale → bleed → save with stage states (done / active / todo). Inline only — no toasts, no global queue." },
  { name: "<BuildFooter>", where: "build tab", desc: "Sticky bottom: counts summary, format picker (PNG / XML / PDF), Build button (disabled until red=0)." },
  { name: "<StatusDot> + tinted rows", where: "build tab", desc: "Subtle row-background tint (10–18% alpha) plus an 8px dot. Reads at a glance, doesn't overpower." },
  { name: "<ArtThumb>", where: "many places", desc: "Striped placeholder until real PNG loads. Lazy-load: 200×280 cached PNG fetched on first paint of the tile/cell that needs it." },
];

function ComponentsDoc() {
  return (
    <div className="compdoc" style={{ width: 900, height: 700 }}>
      <h2>Component breakdown</h2>
      <div className="lead">Reusable units the developer can implement as Jinja partials + small JS modules.</div>
      <div className="comp-list">
        {COMPONENTS.map(c => (
          <div className="comp-card" key={c.name}>
            <div className="cname">{c.name}</div>
            <div className="cwhere">{c.where}</div>
            <div className="cdesc">{c.desc}</div>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 28 }}>UX decisions made</h2>
      <div className="comp-list">
        <div className="comp-card">
          <div className="cname">Add Card → drawer</div>
          <div className="cdesc">Picked drawer over modal: keeps the library visible so you can spot dupes. Modal felt heavy for a tool used solo. Inline panel was rejected because it shifts the grid every time.</div>
        </div>
        <div className="comp-card">
          <div className="cname">Card edit → dedicated page</div>
          <div className="cdesc">Per the brief. /card/&lt;slug&gt; is shareable, refreshable, and gives printings room to breathe. Back button returns to the library.</div>
        </div>
        <div className="comp-card">
          <div className="cname">Build table → not collapsible per-card</div>
          <div className="cdesc">Decklists are 60–100 rows. Collapse per-card adds UI weight without saving much. Instead: 3 density modes (Compact / Comfortable / Grid) toggle at the top.</div>
        </div>
        <div className="comp-card">
          <div className="cname">Job progress → inline only</div>
          <div className="cdesc">Per the answers. No toasts, no global queue panel. The thing that triggered the job shows the job, with a 4-stage strip.</div>
        </div>
        <div className="comp-card">
          <div className="cname">Status → tinted rows + dot</div>
          <div className="cdesc">Tinted backgrounds carry the meaning at a glance, the small dot reinforces it for a11y. No emoji.</div>
        </div>
        <div className="comp-card">
          <div className="cname">Tabs over split-pane</div>
          <div className="cdesc">Library and Build are different mental modes (curate vs print). Tabs avoid context bleed; route URLs are clean.</div>
        </div>
      </div>
    </div>
  );
}

// Color/tone direction card
function ToneCard() {
  return (
    <div className="compdoc" style={{ width: 700, height: 540 }}>
      <h2>Color &amp; tone</h2>
      <div className="lead">Dark, image-forward, Steam/itch-adjacent. The art is the hero — chrome stays out of the way.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 18 }}>
        {[
          ['#14171c', 'bg'], ['#1b1f26', 'bg-2'], ['#232831', 'bg-3'],
          ['#2c323d', 'bg-4'], ['#aab2c0', 'ink-2'], ['#e7ebf1', 'ink'],
        ].map(([c, l]) => (
          <div key={c}>
            <div style={{ background: c, height: 56, borderRadius: 6, border: '1px solid var(--line)' }} />
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>{c}</div>
            <div className="mono" style={{ fontSize: 10 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
        {[
          ['#6dd49a', 'ok · in library', 'var(--ok-bg)'],
          ['#e6c266', 'warn · pick one', 'var(--warn-bg)'],
          ['#e57777', 'bad · missing', 'var(--bad-bg)'],
          ['#8a7cff', 'accent · default / job', 'rgba(138,124,255,0.12)'],
        ].map(([c, l, tint]) => (
          <div key={c} style={{ background: tint, padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: c, borderRadius: '50%' }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{c}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        <b>Type:</b> Inter for UI, JetBrains Mono for set codes, slugs, file paths, stats. No display face — the art carries the personality.<br />
        <b>Density:</b> 12–13px body, 10–11px mono for codes/meta. Generous padding inside cards, tighter in tables.<br />
        <b>Accent use:</b> sparingly. Default-printing highlight, primary CTA, active job. Status colors carry the green/yellow/red signal — the accent is a fourth, neutral signal.
      </div>
    </div>
  );
}

Object.assign(window, {
  AppBar, Sidebar,
  MidLibraryGrid, MidLibraryList, MidBuild, MidCardDetail,
  PageFlow, ComponentsDoc, ToneCard,
});
