// ---- Coach-assigned drills ----
//
// AssignDrills (coach, Manage → Drills): pick players + a library drill, add a
// note ("3 times this week, log your best") and optional due date. Shows open
// and finished assignments by player.
//
// MyAssignedDrills (player, Practice tab): the player's open assignments with
// the drill's how-to, a result box and "Mark done".
//
// Table: drill_assignments (players can only change completed_at/player_result).

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

const CATEGORY_LABELS = {
  putting: 'Putting',
  chipping: 'Chipping',
  pitching: 'Pitching',
  bunker: 'Bunker',
  full_swing: 'Full swing',
  course_management: 'Course management',
};

const chip = { width: 'auto', minHeight: 34, fontSize: 13, padding: '0 10px' };
const fmtDue = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null);
const todayISO = () => new Date().toLocaleDateString('en-CA');

// ============================ coach ============================

export function AssignDrills() {
  const [players, setPlayers] = useState([]);
  const [drills, setDrills] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingTable, setMissingTable] = useState(false);

  const [picked, setPicked] = useState(new Set());
  const [drillId, setDrillId] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true); setError('');
    const [pl, dl, as] = await Promise.all([
      supabase.from('players').select('id, full_name, gender, archived').order('full_name'),
      supabase.from('drill_library').select('id, title, skill_category, item_type').eq('is_active', true).eq('item_type', 'drill').order('skill_category').order('sort_order'),
      supabase.from('drill_assignments').select('id, player_id, drill_id, note, due_on, completed_at, player_result, created_at').order('created_at', { ascending: false }),
    ]);
    if (as.error) {
      if (/drill_assignments/.test(as.error.message)) setMissingTable(true);
      else setError(as.error.message);
    }
    setPlayers((pl.data ?? []).filter((p) => !p.archived));
    setDrills(dl.data ?? []);
    setRows(as.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function togglePlayer(id) {
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function pickGroup(gender) {
    setPicked(new Set(players.filter((p) => !gender || p.gender === gender).map((p) => p.id)));
  }

  async function assign() {
    setError(''); setMsg('');
    if (!drillId || picked.size === 0) return;
    setSaving(true);
    const payload = [...picked].map((player_id) => ({
      player_id, drill_id: drillId, note: note.trim() || null, due_on: due || null,
    }));
    const { error: e } = await supabase.from('drill_assignments').insert(payload);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setMsg(`Assigned to ${picked.size} player${picked.size === 1 ? '' : 's'}.`);
    setPicked(new Set()); setNote(''); setDue('');
    load();
  }

  async function remove(id) {
    const { error: e } = await supabase.from('drill_assignments').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  if (loading) return <p className="muted">Loading drill assignments…</p>;
  if (missingTable) {
    return (
      <div className="card">
        <h2>Assign drills</h2>
        <p className="muted" style={{ margin: 0 }}>
          Drill assignments aren't set up for this school yet. Run the drill_assignments SQL
          in this school's Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

  const drillById = Object.fromEntries(drills.map((d) => [d.id, d]));
  const nameById = Object.fromEntries(players.map((p) => [p.id, p.full_name]));
  const cats = [...new Set(drills.map((d) => d.skill_category))];

  // group assignments by player: open first, then the 3 most recent done
  const byPlayer = {};
  for (const r of rows) {
    if (!nameById[r.player_id]) continue; // archived players drop off the list
    (byPlayer[r.player_id] ??= []).push(r);
  }
  const playerIds = Object.keys(byPlayer).sort((a, b) => nameById[a].localeCompare(nameById[b]));

  return (
    <>
      <div className="card">
        <h2>Assign a drill</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Players see it at the top of their Practice tab and check it off.
        </p>

        <label>Players</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="secondary" style={chip} onClick={() => pickGroup('boys')}>All boys</button>
          <button className="secondary" style={chip} onClick={() => pickGroup('girls')}>All girls</button>
          <button className="secondary" style={chip} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {players.map((p) => (
            <button key={p.id} className={picked.has(p.id) ? '' : 'secondary'} style={chip} onClick={() => togglePlayer(p.id)}>
              {p.full_name}
            </button>
          ))}
        </div>

        <label style={{ marginTop: 12 }}>Drill</label>
        <select value={drillId} onChange={(e) => setDrillId(e.target.value)}>
          <option value="">Choose a drill…</option>
          {cats.map((c) => (
            <optgroup key={c} label={CATEGORY_LABELS[c] ?? c}>
              {drills.filter((d) => d.skill_category === c).map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <label style={{ marginTop: 12 }}>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 times this week, log your best score" />

        <label style={{ marginTop: 12 }}>Due (optional)</label>
        <input type="date" value={due} min={todayISO()} onChange={(e) => setDue(e.target.value)} />

        <div className="spacer" />
        <button onClick={assign} disabled={saving || !drillId || picked.size === 0}>
          {saving ? 'Assigning…' : `Assign${picked.size ? ` to ${picked.size}` : ''}`}
        </button>
        {msg && <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>{msg}</p>}
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="card">
        <h2>Assigned drills</h2>
        {playerIds.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing assigned yet.</p>}
        {playerIds.map((pid) => {
          const list = byPlayer[pid];
          const open = list.filter((r) => !r.completed_at);
          const done = list.filter((r) => r.completed_at).slice(0, 3);
          return (
            <div key={pid} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <strong>{nameById[pid]}</strong>
              <span className="muted" style={{ fontSize: 12 }}> · {open.length} open</span>
              {[...open, ...done].map((r) => {
                const overdue = !r.completed_at && r.due_on && r.due_on < todayISO();
                return (
                  <div key={r.id} className="row-between" style={{ fontSize: 13, marginTop: 4, gap: 8 }}>
                    <span style={{ minWidth: 0 }}>
                      {r.completed_at ? '✓ ' : '○ '}
                      {drillById[r.drill_id]?.title ?? 'Drill'}
                      {r.player_result && <strong> · {r.player_result}</strong>}
                      {!r.completed_at && r.due_on && (
                        <span style={{ color: overdue ? 'var(--flag)' : 'var(--muted)' }}> · due {fmtDue(r.due_on)}</span>
                      )}
                    </span>
                    <button className="secondary" style={{ ...chip, minHeight: 28, fontSize: 12 }} onClick={() => remove(r.id)}>Remove</button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================ player ============================

export function MyAssignedDrills() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [drills, setDrills] = useState({});
  const [open, setOpen] = useState(null);
  const [result, setResult] = useState({});
  const [error, setError] = useState('');

  async function load() {
    const { data: p } = await supabase.from('players').select('id').eq('user_id', user.id).maybeSingle();
    if (!p) { setRows([]); return; }
    const { data, error: e } = await supabase
      .from('drill_assignments')
      .select('id, drill_id, note, due_on, completed_at, player_result, created_at')
      .eq('player_id', p.id)
      .order('created_at', { ascending: false });
    if (e) { setRows([]); return; } // table not set up yet: just hide
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((r) => r.drill_id))];
    if (ids.length) {
      const { data: dl } = await supabase.from('drill_library').select('id, title, summary, instructions, skill_category').in('id', ids);
      setDrills(Object.fromEntries((dl ?? []).map((d) => [d.id, d])));
    }
  }
  useEffect(() => { load(); }, [user.id]);

  async function markDone(r, done) {
    setError('');
    const patch = done
      ? { completed_at: new Date().toISOString(), player_result: (result[r.id] ?? '').trim() || null }
      : { completed_at: null };
    const { error: e } = await supabase.from('drill_assignments').update(patch).eq('id', r.id);
    if (e) { setError(e.message); return; }
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
  }

  if (!rows || rows.length === 0) return null;
  const pending = rows.filter((r) => !r.completed_at);
  const recentDone = rows.filter((r) => r.completed_at).slice(0, 3);

  return (
    <div className="card" style={{ border: '1.5px solid var(--green-500)' }}>
      <p className="eyebrow">From your coach</p>
      {pending.length === 0 && <p className="muted" style={{ margin: '0 0 6px' }}>All caught up. Nice work! 🎉</p>}

      {pending.map((r) => {
        const d = drills[r.drill_id];
        const overdue = r.due_on && r.due_on < todayISO();
        const expanded = open === r.id;
        return (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div onClick={() => setOpen(expanded ? null : r.id)} style={{ cursor: 'pointer' }}>
              <strong>{d?.title ?? 'Drill'}</strong>
              <span className="muted" style={{ fontSize: 12 }}> {expanded ? '▲' : '▼ how to'}</span>
              {r.note && <div style={{ fontSize: 14, marginTop: 2 }}>{r.note}</div>}
              {r.due_on && (
                <div style={{ fontSize: 12, marginTop: 2, color: overdue ? 'var(--flag)' : 'var(--muted)' }}>
                  {overdue ? 'Was due' : 'Due'} {fmtDue(r.due_on)}
                </div>
              )}
            </div>
            {expanded && d && (
              <p style={{ fontSize: 14, margin: '8px 0', lineHeight: 1.45 }}>{d.instructions || d.summary}</p>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                style={{ flex: 1, minHeight: 36, fontSize: 14 }}
                placeholder="Your score (optional)"
                value={result[r.id] ?? ''}
                onChange={(e) => setResult((m) => ({ ...m, [r.id]: e.target.value }))}
              />
              <button style={{ ...chip, minHeight: 36 }} onClick={() => markDone(r, true)}>Mark done</button>
            </div>
          </div>
        );
      })}

      {recentDone.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {recentDone.map((r) => (
            <div key={r.id} className="row-between" style={{ fontSize: 13, color: 'var(--muted)', padding: '3px 0' }}>
              <span>✓ {drills[r.drill_id]?.title ?? 'Drill'}{r.player_result ? ` · ${r.player_result}` : ''}</span>
              <a style={{ cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }} onClick={() => markDone(r, false)}>undo</a>
            </div>
          ))}
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
