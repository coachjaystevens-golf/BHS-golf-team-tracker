// ---- SeasonRollover: start next season in one pass (Manage → Seasons) ----
//
// 1. Pick the next season (one already created under "New season").
// 2. Go through this season's roster: each player is Returning or Leaving.
//    Seniors (grade 12) default to Leaving.
// 3. Start: returning players are put on the new season's roster (grades
//    bumped by one where a grade is set), leaving players are archived (all
//    their history is kept), and the new season becomes the active one.
//
// Nothing is deleted. A player archived by mistake can be restored under
// Roster → Archived players and added to the season roster there.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function SeasonRollover({ onDone }) {
  const [seasons, setSeasons] = useState([]);
  const [players, setPlayers] = useState([]);
  const [roster, setRoster] = useState([]);       // current season's player ids
  const [nextId, setNextId] = useState('');
  const [leaving, setLeaving] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: ss }, { data: pl }] = await Promise.all([
      supabase.from('seasons').select('id, name, starts_on, is_active').order('starts_on'),
      supabase.from('players').select('id, full_name, gender, grade, archived').order('full_name'),
    ]);
    const all = ss ?? [];
    setSeasons(all);
    const active = all.find((s) => s.is_active);
    const later = all.filter((s) => !s.is_active && (!active || s.starts_on > active.starts_on));
    setNextId(later[0]?.id ?? '');

    const current = (pl ?? []).filter((p) => !p.archived);
    setPlayers(current);
    let ids = current.map((p) => p.id);
    if (active) {
      const { data: sp } = await supabase.from('season_players').select('player_id').eq('season_id', active.id);
      const onTeam = new Set((sp ?? []).map((r) => r.player_id));
      if (onTeam.size) ids = current.filter((p) => onTeam.has(p.id)).map((p) => p.id);
    }
    setRoster(ids);
    setLeaving(new Set(current.filter((p) => ids.includes(p.id) && p.grade === 12).map((p) => p.id)));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return null;

  const active = seasons.find((s) => s.is_active);
  const next = seasons.find((s) => s.id === nextId);
  const candidates = seasons.filter((s) => !s.is_active);
  const list = players.filter((p) => roster.includes(p.id));
  const returning = list.filter((p) => !leaving.has(p.id));
  const going = list.filter((p) => leaving.has(p.id));

  function toggle(id) {
    setLeaving((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function start() {
    setError(''); setBusy(true);
    try {
      // 1. returning players onto the new season's roster
      const { data: already } = await supabase.from('season_players').select('player_id').eq('season_id', nextId);
      const have = new Set((already ?? []).map((r) => r.player_id));
      const add = returning.filter((p) => !have.has(p.id)).map((p) => ({ season_id: nextId, player_id: p.id }));
      if (add.length) {
        const { error: e } = await supabase.from('season_players').insert(add);
        if (e) throw e;
      }
      // 2. bump grades for returning players who have one
      for (const p of returning) {
        if (p.grade != null && p.grade < 12) {
          const { error: e } = await supabase.from('players').update({ grade: p.grade + 1 }).eq('id', p.id);
          if (e) throw e;
        }
      }
      // 3. archive leaving players (history is kept)
      if (going.length) {
        const { error: e } = await supabase
          .from('players')
          .update({ archived: true, archived_at: new Date().toISOString() })
          .in('id', going.map((p) => p.id));
        if (e) throw e;
      }
      // 4. make the new season active
      const { error: e1 } = await supabase.from('seasons').update({ is_active: false }).neq('id', nextId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('seasons').update({ is_active: true }).eq('id', nextId);
      if (e2) throw e2;

      setDone(`${next.name} is now the active season with ${returning.length} returning player${returning.length === 1 ? '' : 's'}.`
        + (going.length ? ` ${going.length} archived.` : ''));
      setOpen(false);
      onDone?.();
      // the app's season picker reads seasons at sign-in, so reload to pick up the change
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setError(`${e.message}. Nothing after this step ran; you can safely try again.`);
    }
    setBusy(false);
  }

  return (
    <div className="card" style={{ border: '1.5px solid var(--green-500)' }}>
      <h2>Start next season</h2>
      {done ? (
        <p style={{ margin: 0 }}>✓ {done}</p>
      ) : !open ? (
        <>
          <p className="muted" style={{ marginBottom: 8 }}>
            Carry returning players forward, archive graduates, and switch the
            active season, all in one step.
            {active && <> Current season: <strong>{active.name}</strong>.</>}
          </p>
          <button onClick={() => setOpen(true)} disabled={candidates.length === 0}>Set up next season</button>
          {candidates.length === 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              First add the next season below under "New season".
            </p>
          )}
        </>
      ) : (
        <>
          <label>Next season</label>
          <select value={nextId} onChange={(e) => setNextId(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <p className="eyebrow" style={{ marginTop: 14 }}>
            {active ? `${active.name} roster` : 'Current players'}: tap anyone who is leaving
          </p>
          {['boys', 'girls'].map((g) => {
            const grp = list.filter((p) => p.gender === g);
            if (!grp.length) return null;
            return (
              <div key={g} style={{ marginBottom: 8 }}>
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 4px' }}>{g === 'boys' ? 'Boys' : 'Girls'}</p>
                {grp.map((p) => {
                  const out = leaving.has(p.id);
                  return (
                    <div key={p.id} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <span style={{ textDecoration: out ? 'line-through' : 'none', color: out ? 'var(--muted)' : undefined }}>
                        {p.full_name}{p.grade ? <span className="muted"> · gr {p.grade}</span> : null}
                      </span>
                      <button
                        className={out ? '' : 'secondary'}
                        style={{ width: 'auto', minHeight: 32, fontSize: 12, padding: '0 10px' }}
                        onClick={() => toggle(p.id)}
                      >{out ? 'Leaving' : 'Returning'}</button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div style={{ background: 'var(--green-100)', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 14 }}>
            <strong>{returning.length}</strong> returning go onto {next?.name ?? 'the next season'}
            {going.length > 0 && <> · <strong>{going.length}</strong> leaving will be archived (stats kept)</>}
            {' '}· {next?.name ?? 'It'} becomes the active season.
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              New players can be added under Roster afterward.
            </div>
          </div>

          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
          <div className="spacer" />
          <button onClick={start} disabled={busy || !nextId}>{busy ? 'Starting…' : `Start ${next?.name ?? 'season'}`}</button>
          <div className="spacer" />
          <button className="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
        </>
      )}
    </div>
  );
}
