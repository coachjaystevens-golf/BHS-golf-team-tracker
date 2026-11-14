// ---- MissingHoles: coach list of score cards with holes not entered ----
//
// Incomplete cards are left out of scoring averages (Compare, and anywhere
// "complete cards only" applies), so this list lets the coach finish them —
// "Fix" opens that player's card in score entry — or mark them "Leave as is"
// when the player really didn't finish (picked up, weather, left early).
// "Leave as is" is remembered on this device.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { fetchAll } from '../lib/fetchAll.js';
import { useAuth } from '../AuthContext.jsx';

const HIDDEN_KEY = 'bhsgolf_missing_holes_hidden_v1';
const PREVIEW = 6;

function readHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
}
function writeHidden(set) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* storage full/blocked: ignore */ }
}

// [1,2,3,7,9,10] -> "1–3, 7, 9–10"
function ranges(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j;
  }
  return out.join(', ');
}

const fmtDate = (d) => (d
  ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  : 'No date');

export default function MissingHoles() {
  const { seasonId } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  const [kind, setKind] = useState('match');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!seasonId) { setCards([]); return; }
    let live = true;
    (async () => {
      const { data, error } = await fetchAll(() => supabase
        .from('scores')
        .select('id, hole_number, player_id, players ( id, full_name, archived ), rounds!inner ( id, type, played_on, season_id, start_hole, end_hole, courses ( name ) )')
        .eq('rounds.season_id', seasonId));
      if (!live) return;
      if (error) { setCards([]); return; }

      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
      const byCard = {};
      for (const row of data) {
        const r = row.rounds;
        if (!r?.id || !row.players?.id) continue;
        if (r.played_on === today) continue; // still being played — "out now" covers it
        const key = `${r.id}:${row.players.id}`;
        if (!byCard[key]) {
          byCard[key] = {
            key,
            roundId: r.id,
            playerId: row.players.id,
            name: row.players.full_name,
            archived: !!row.players.archived,
            type: r.type,
            playedOn: r.played_on,
            course: r.courses?.name ?? 'Course',
            start: r.start_hole ?? 1,
            end: r.end_hole ?? 18,
            entered: new Set(),
          };
        }
        byCard[key].entered.add(row.hole_number);
      }

      const list = [];
      for (const c of Object.values(byCard)) {
        const missing = [];
        for (let h = c.start; h <= c.end; h++) if (!c.entered.has(h)) missing.push(h);
        if (missing.length) list.push({ ...c, missing, holeCount: c.end - c.start + 1 });
      }
      list.sort((a, b) => (b.playedOn ?? '').localeCompare(a.playedOn ?? '') || a.name.localeCompare(b.name));
      setCards(list);
    })();
    return () => { live = false; };
  }, [seasonId]);

  if (!cards) return null;
  const visible = cards.filter((c) => !hidden.has(c.key));
  if (visible.length === 0 && hidden.size === 0) return null;

  const matches = visible.filter((c) => c.type === 'match');
  const practice = visible.filter((c) => c.type !== 'match');
  const current = kind === 'match' ? matches : practice;
  const shown = showAll ? current : current.slice(0, PREVIEW);

  function leave(key) {
    const next = new Set(hidden); next.add(key);
    setHidden(next); writeHidden(next);
  }
  function unhideAll() {
    const next = new Set();
    setHidden(next); writeHidden(next);
  }

  // group the shown cards under their round (date · course)
  const groups = [];
  for (const c of shown) {
    const last = groups[groups.length - 1];
    if (last && last.roundId === c.roundId) last.cards.push(c);
    else groups.push({ roundId: c.roundId, label: `${fmtDate(c.playedOn)} · ${c.course}`, cards: [c] });
  }

  const tabBtn = { width: 'auto', minHeight: 34, fontSize: 13, padding: '0 10px', flex: 1 };

  return (
    <div className="card" style={{ border: '1.5px solid #e0a800' }}>
      <h2>Cards with missing holes ({visible.length})</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Averages skip incomplete cards. Tap <strong>Fix</strong> to enter the missing holes, or{' '}
        <strong>Leave</strong> if the player didn't finish.
      </p>

      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        <button className={kind === 'match' ? '' : 'secondary'} style={tabBtn} onClick={() => { setKind('match'); setShowAll(false); }}>
          Matches ({matches.length})
        </button>
        <button className={kind === 'practice' ? '' : 'secondary'} style={tabBtn} onClick={() => { setKind('practice'); setShowAll(false); }}>
          Practice ({practice.length})
        </button>
      </div>

      {current.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          {kind === 'match' ? 'All match cards are complete. 🎉' : 'All practice cards are complete.'}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.roundId} style={{ marginTop: 8 }}>
          <p className="eyebrow" style={{ marginBottom: 2 }}>{g.label}</p>
          {g.cards.map((c) => (
            <div key={c.key} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{c.name}</strong>{c.archived && <span className="muted"> (archived)</span>}
                <div className="muted" style={{ fontSize: 12 }}>
                  {c.holeCount - c.missing.length}/{c.holeCount} entered · missing {ranges(c.missing)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 10px' }}
                  onClick={() => navigate(`/round/${c.roundId}?player=${c.playerId}`)}
                >Fix</button>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 8px' }}
                  onClick={() => leave(c.key)}
                >Leave</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {current.length > PREVIEW && (
        <button className="secondary" style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${current.length}`}
        </button>
      )}
      {hidden.size > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          {hidden.size} left as is on this phone ·{' '}
          <a style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={unhideAll}>show them again</a>
        </p>
      )}
    </div>
  );
}
