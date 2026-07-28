import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatToPar } from '../lib/scoring.js';

// Local YYYY-MM-DD (matches how Rounds.jsx stamps played_on)
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Fixed alert rule: 3+ putts on 2 of the last 3 holes entered.
function hasPuttAlert(holes) {
  const withPutts = holes
    .filter((h) => h.putts != null)
    .sort((a, b) => a.hole_number - b.hole_number);
  const lastThree = withPutts.slice(-3);
  const bad = lastThree.filter((h) => h.putts >= 3).length;
  return lastThree.length >= 2 && bad >= 2;
}

export default function LiveRound() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // view: which stat the grid colors by
  const [view, setView] = useState('putts'); // 'putts' | 'gir' | 'fairway'
  // which player's round is pending a force-close confirm
  const [confirmId, setConfirmId] = useState(null);
  // players currently out: [{ player_id, full_name, gender, course, par[], holes:[{hole_number,strokes,putts,fairway_hit,green_in_regulation}] }]
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setError('');
    // 1. Today's in-progress rounds
    const { data: liveRounds, error: re } = await supabase
      .from('rounds')
      .select('id, type, boys_count, girls_count, start_hole, end_hole, courses ( name, par_per_hole )')
      .eq('status', 'in_progress')
      .eq('played_on', todayStr());
    if (re) { setError(re.message); setLoading(false); return; }

    if (!liveRounds || liveRounds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const roundIds = liveRounds.map((r) => r.id);
    const roundById = {};
    liveRounds.forEach((r) => { roundById[r.id] = r; });

    // Lineups for these rounds (matches only have them). Map: roundId -> Set(playerId)
    const { data: lineupRows } = await supabase
      .from('round_lineup')
      .select('round_id, player_id')
      .in('round_id', roundIds);
    const lineupByRound = {};
    (lineupRows ?? []).forEach((l) => {
      if (!lineupByRound[l.round_id]) lineupByRound[l.round_id] = new Set();
      lineupByRound[l.round_id].add(l.player_id);
    });

    // 2. All scores under those rounds
    const { data: scores, error: se } = await supabase
      .from('scores')
      .select('round_id, player_id, hole_number, strokes, putts, fairway_hit, green_in_regulation')
      .in('round_id', roundIds);
    if (se) { setError(se.message); setLoading(false); return; }

    if (!scores || scores.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 3. Look up the players behind those scores
    const playerIds = [...new Set(scores.map((s) => s.player_id))];
    const { data: players, error: pe } = await supabase
      .from('players')
      .select('id, full_name, gender')
      .in('id', playerIds);
    if (pe) { setError(pe.message); setLoading(false); return; }
    const playerById = {};
    (players ?? []).forEach((p) => { playerById[p.id] = p; });

    // 4. Group scores by player (a player is in exactly one live round today)
    const byPlayer = {};
    scores.forEach((s) => {
      const rnd = roundById[s.round_id];
      const lineupSet = lineupByRound[s.round_id];
      const isMatch = rnd?.type === 'match';
      const hasLineup = isMatch && lineupSet && lineupSet.size > 0;
      // In a match with a designated lineup, only show designated players.
      if (hasLineup && !lineupSet.has(s.player_id)) return;

      if (!byPlayer[s.player_id]) {
        const player = playerById[s.player_id];
        byPlayer[s.player_id] = {
          player_id: s.player_id,
          round_id: s.round_id,
          full_name: player?.full_name ?? 'Unknown player',
          gender: player?.gender ?? null,
          course: rnd?.courses?.name ?? 'Course',
          par: rnd?.courses?.par_per_hole ?? [],
          is_match: isMatch,
          boys_count: rnd?.boys_count ?? null,
          girls_count: rnd?.girls_count ?? null,
          holes: [],
        };
      }
      byPlayer[s.player_id].holes.push({
        hole_number: s.hole_number,
        strokes: s.strokes,
        putts: s.putts,
        fairway_hit: s.fairway_hit,
        green_in_regulation: s.green_in_regulation,
      });
    });

    const list = Object.values(byPlayer).map((p) => {
      p.holes.sort((a, b) => a.hole_number - b.hole_number);
      return p;
    });
    // sort by name within the page; gender grouping handled in render
    list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Realtime: any score change re-pulls the board.
    const channel = supabase
      .channel('live-scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Coach manually closes a stuck round so it drops off the live board.
  async function forceComplete(roundId) {
    setError('');
    const { error: ue } = await supabase
      .from('rounds')
      .update({ status: 'complete' })
      .eq('id', roundId);
    if (ue) { setError(ue.message); return; }
    setConfirmId(null);
    load();
  }

  if (loading) return <div className="content"><p className="muted">Loading live board…</p></div>;

  const boys = rows.filter((r) => r.gender === 'male' || r.gender === 'boys' || r.gender === 'M');
  const girls = rows.filter((r) => r.gender === 'female' || r.gender === 'girls' || r.gender === 'F');
  const other = rows.filter((r) => !boys.includes(r) && !girls.includes(r));

  // running to-par for a player's entered holes
  const playerToPar = (p) => {
    let diff = 0;
    let counted = 0;
    p.holes.forEach((h) => {
      const par = p.par[h.hole_number - 1];
      if (par && h.strokes != null) { diff += h.strokes - par; counted++; }
    });
    return counted ? diff : null;
  };

  // Compute counted team total: take players with a finished-enough score,
  // sort by to-par ascending, count the best `n`, drop the rest.
  // Returns { total, countedIds:Set, n } or null if not a counted match group.
  const teamTotal = (players, n) => {
    if (!n || players.length === 0) return null;
    const scored = players
      .map((p) => ({ id: p.player_id, tp: playerToPar(p) }))
      .filter((x) => x.tp != null)
      .sort((a, b) => a.tp - b.tp);
    if (scored.length === 0) return null;
    const counted = scored.slice(0, n);
    const countedIds = new Set(counted.map((x) => x.id));
    const total = counted.reduce((sum, x) => sum + x.tp, 0);
    return { total, countedIds, n, have: scored.length };
  };

  // color a single hole cell based on the active view
  const cellStyle = (h) => {
    const base = {
      minWidth: 30, textAlign: 'center', padding: '4px 0', borderRadius: 6,
      fontSize: 13, fontWeight: 600,
    };
    if (view === 'putts') {
      if (h.putts == null) return { ...base, background: 'var(--white)', color: 'var(--muted)', border: '1px solid var(--line)' };
      if (h.putts >= 3) return { ...base, background: 'var(--flag)', color: 'var(--white)' };
      if (h.putts === 2) return { ...base, background: 'var(--green-100, #e4f3e7)', color: 'var(--ink)' };
      return { ...base, background: 'var(--green-500)', color: 'var(--white)' }; // 0-1 putts, great
    }
    if (view === 'gir') {
      if (h.green_in_regulation == null) return { ...base, background: 'var(--white)', color: 'var(--muted)', border: '1px solid var(--line)' };
      return h.green_in_regulation
        ? { ...base, background: 'var(--green-500)', color: 'var(--white)' }
        : { ...base, background: 'var(--flag)', color: 'var(--white)' };
    }
    // fairway
    if (h.fairway_hit == null) return { ...base, background: 'var(--white)', color: 'var(--muted)', border: '1px solid var(--line)' };
    return h.fairway_hit
      ? { ...base, background: 'var(--green-500)', color: 'var(--white)' }
      : { ...base, background: 'var(--flag)', color: 'var(--white)' };
  };

  // Strokes for a hole, always shown regardless of the active view.
  // Colored against par so the coach can scan the round at a glance.
  const strokeStyle = (h, par) => {
    const base = {
      minWidth: 30, textAlign: 'center', padding: '2px 0', borderRadius: 6,
      fontSize: 14, fontWeight: 700, lineHeight: 1.2,
    };
    if (h.strokes == null) return { ...base, color: 'var(--muted)' };
    if (par == null) return { ...base, color: 'var(--ink)' };
    const d = h.strokes - par;
    if (d <= -2) return { ...base, color: 'var(--white)', background: '#8e44ad' };   // eagle+
    if (d === -1) return { ...base, color: 'var(--white)', background: 'var(--green-500)' }; // birdie
    if (d === 0) return { ...base, color: 'var(--ink)' };                             // par
    if (d === 1) return { ...base, color: 'var(--ink)', background: '#f6dcd9' };      // bogey
    return { ...base, color: 'var(--white)', background: 'var(--flag)' };             // double+
  };

  // what text shows in a hole cell for the active view
  const cellText = (h) => {
    if (view === 'putts') return h.putts == null ? '·' : h.putts;
    if (view === 'gir') return h.green_in_regulation == null ? '·' : h.green_in_regulation ? '✓' : '✗';
    return h.fairway_hit == null ? '·' : h.fairway_hit ? '✓' : '✗';
  };

  const PlayerCard = ({ p, dropped }) => {
    const tp = playerToPar(p);
    const alert = hasPuttAlert(p.holes);
    const lastHole = p.holes.length ? p.holes[p.holes.length - 1].hole_number : '—';
    return (
      <div
        className="card"
        style={{
          padding: 12,
          border: alert ? '2px solid var(--flag)' : undefined,
          opacity: dropped ? 0.55 : 1,
        }}
      >
        <div className="row-between" style={{ marginBottom: 6 }}>
          <div>
            <strong>{p.full_name}</strong>
            {dropped && (
              <span
                className="muted"
                style={{
                  fontSize: 11, fontWeight: 700, marginLeft: 6,
                  textTransform: 'uppercase', letterSpacing: 0.3,
                }}
              >
                drop
              </span>
            )}
            <div className="muted" style={{ fontSize: 12 }}>{p.course} · thru {p.holes.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="chip even">{tp == null ? '—' : formatToPar(tp)}</div>
            {alert && (
              <div style={{ color: 'var(--flag)', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                ⚠ Putts
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
          {p.holes.map((h) => (
            <div key={h.hole_number} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{h.hole_number}</div>
              <div style={strokeStyle(h, p.par[h.hole_number - 1])}>
                {h.strokes == null ? '·' : h.strokes}
              </div>
              <div style={cellStyle(h)}>{cellText(h)}</div>
            </div>
          ))}
        </div>

        {confirmId === p.player_id ? (
          <div style={{ marginTop: 8 }}>
            <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Mark this round complete? It will drop off the live board.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ width: 'auto', padding: '0 10px', fontSize: 12, background: 'var(--flag)' }}
                onClick={() => forceComplete(p.round_id)}
              >
                Yes, complete it
              </button>
              <button
                className="secondary"
                style={{ width: 'auto', padding: '0 10px', fontSize: 12 }}
                onClick={() => setConfirmId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="secondary"
            style={{ width: 'auto', padding: '0 10px', fontSize: 12, marginTop: 8, color: 'var(--muted)' }}
            onClick={() => setConfirmId(p.player_id)}
          >
            Force complete
          </button>
        )}
      </div>
    );
  };

  const Group = ({ title, players, count }) => {
    if (players.length === 0) return null;
    const tt = teamTotal(players, count);
    // Order the board best-to-worst when we're counting, so drops sit at the bottom.
    const ordered = tt
      ? [...players].sort((a, b) => {
          const ap = playerToPar(a), bp = playerToPar(b);
          if (ap == null) return 1;
          if (bp == null) return -1;
          return ap - bp;
        })
      : players;
    return (
      <>
        <div className="row-between" style={{ alignItems: 'baseline', marginTop: 4 }}>
          <p className="eyebrow" style={{ margin: 0 }}>{title}</p>
          {tt && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>
                {formatToPar(tt.total)}
              </span>
              <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                top {tt.n}{tt.have < tt.n ? ` (only ${tt.have} in)` : ''}
              </span>
            </div>
          )}
        </div>
        {ordered.map((p) => (
          <PlayerCard
            key={p.player_id}
            p={p}
            dropped={tt ? !tt.countedIds.has(p.player_id) : false}
          />
        ))}
      </>
    );
  };

  return (
    <div className="content">
      <div className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Live Round</h2>
          <button className="secondary" style={{ width: 'auto', padding: '0 10px' }} onClick={load}>↻</button>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Players who've posted at least one hole today. Updates live as scores come in.
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {['putts', 'gir', 'fairway'].map((v) => (
            <button
              key={v}
              className={view === v ? '' : 'secondary'}
              style={{ fontSize: 13, padding: '0 10px', textTransform: 'capitalize' }}
              onClick={() => setView(v)}
            >
              {v === 'gir' ? 'Greens' : v === 'fairway' ? 'Fairways' : 'Putts'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {rows.length === 0 ? (
        <div className="card">
          <p className="muted">
            No live rounds right now. Players appear here the moment they save
            their first hole in a round dated today.
          </p>
        </div>
      ) : (
        <>
          {/* Only count when this is a match group (players carry the rule). */}
          <Group
            title="Boys"
            players={boys}
            count={boys.find((p) => p.is_match)?.boys_count ?? null}
          />
          <Group
            title="Girls"
            players={girls}
            count={girls.find((p) => p.is_match)?.girls_count ?? null}
          />
          <Group title="Players" players={other} count={null} />
        </>
      )}
    </div>
  );
}
