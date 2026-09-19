import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ============================================================
   Drill definitions — config lives on the session row (jsonb),
   so tuning a drill later never needs a schema change.
   ============================================================ */

const DRILLS = {
  clock: {
    name: 'Clock Drill',
    tagline: '12 putts around the hole from 4 ft',
    outcomes: 'two',                    // Made / Miss
    defaultConfig: { putts: 12, distance_ft: 4 },
    describe: (c) => `${c.putts} putts from ${c.distance_ft} ft, circled around one hole`,
    maxPoints: (c) => c.putts,
    scoreLabel: 'makes',
  },
  ladder: {
    name: 'Lag Ladder',
    tagline: 'Distance control from 20 / 30 / 40 ft',
    outcomes: 'three',                  // Holed / Inside 3 ft / Miss
    defaultConfig: { distances_ft: [20, 30, 40], putts_per_distance: 3 },
    describe: (c) => `${c.putts_per_distance} putts each from ${c.distances_ft.join(', ')} ft — finish inside 3 ft past`,
    maxPoints: (c) => c.distances_ft.length * c.putts_per_distance * 2,
    scoreLabel: 'points',
  },
  gate: {
    name: 'Pressure Gate',
    tagline: 'Makes in a row from 5 ft — miss resets to zero',
    outcomes: 'two',
    defaultConfig: { distance_ft: 5, streak_target: 10 },
    describe: (c) => `Make ${c.streak_target} in a row from ${c.distance_ft} ft. A miss resets the streak.`,
    maxPoints: (c) => c.streak_target,
    scoreLabel: 'best streak',
  },
  points: {
    name: 'Distance Control Points',
    tagline: 'Scored putts from ~30 ft: 2 / 1 / 0',
    outcomes: 'three',
    defaultConfig: { putts: 12, distance_ft: 30 },
    describe: (c) => `${c.putts} putts from ~${c.distance_ft} ft. 2 holed · 1 inside 3 ft past · 0 short or long`,
    maxPoints: (c) => c.putts * 2,
    scoreLabel: 'points',
  },
};

function pointsFor(drillKey, outcome) {
  if (drillKey === 'clock' || drillKey === 'gate') return outcome === 'holed' ? 1 : 0;
  return outcome === 'holed' ? 2 : outcome === 'zone' ? 1 : 0;
}

// Which distance is the current attempt hit from (ladder walks up the rungs).
function distanceForAttempt(drillKey, config, attemptIndex) {
  if (drillKey === 'ladder') {
    const per = config.putts_per_distance ?? 3;
    const rung = Math.min(
      Math.floor(attemptIndex / per),
      (config.distances_ft?.length ?? 1) - 1
    );
    return config.distances_ft?.[rung] ?? null;
  }
  return config.distance_ft ?? null;
}

// Longest run of consecutive makes, and the current live run.
function streaks(attempts) {
  let best = 0, cur = 0;
  attempts.forEach((a) => {
    if (a.outcome === 'holed') { cur += 1; if (cur > best) best = cur; }
    else cur = 0;
  });
  return { best, cur };
}

// Total attempts a session allows (null = open-ended, i.e. the gate drill).
function attemptLimit(drillKey, config) {
  if (drillKey === 'clock' || drillKey === 'points') return config.putts ?? 12;
  if (drillKey === 'ladder') return (config.distances_ft?.length ?? 3) * (config.putts_per_distance ?? 3);
  return null;
}

// One player's headline number for a pile of attempts.
function summarize(drillKey, attempts) {
  if (drillKey === 'gate') {
    return { value: streaks(attempts).best, attempts: attempts.length };
  }
  return {
    value: attempts.reduce((s, a) => s + a.points, 0),
    attempts: attempts.length,
  };
}

export default function PuttingDrills() {
  const { sessionId } = useParams();
  if (sessionId) return <PuttingPlay sessionId={sessionId} />;
  return <PuttingList />;
}

/* ============================================================
   LIST — start a session, see recent sessions + season bests
   ============================================================ */

function PuttingList() {
  const { seasonId, activeSeason } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [best, setBest] = useState({});          // drill_key -> [{name, value, sessions}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(null);  // drill being started
  const [playedOn, setPlayedOn] = useState(todayStr());
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    if (!seasonId) { setSessions([]); setBest({}); setLoading(false); return; }

    const { data: s, error: se } = await supabase
      .from('putting_sessions')
      .select('id, drill_key, label, played_on, status, config')
      .eq('season_id', seasonId)
      .order('played_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (se) { setError(se.message); setLoading(false); return; }
    setSessions(s ?? []);

    // Season bests: every attempt this season, grouped per drill per player,
    // best single-session result kept. Same isolation rule as the challenge —
    // none of this ever touches round scoring stats.
    const { data: rows } = await supabase
      .from('putting_attempts')
      .select('player_id, session_id, outcome, points, putting_sessions!inner ( season_id, drill_key )')
      .eq('putting_sessions.season_id', seasonId)
      .order('attempt_number');

    const bySession = {}; // drill_key -> player_id -> session_id -> attempts[]
    (rows ?? []).forEach((r) => {
      const dk = r.putting_sessions.drill_key;
      bySession[dk] ??= {};
      bySession[dk][r.player_id] ??= {};
      bySession[dk][r.player_id][r.session_id] ??= [];
      bySession[dk][r.player_id][r.session_id].push(r);
    });

    const playerIds = [...new Set((rows ?? []).map((r) => r.player_id))];
    let nameById = {};
    if (playerIds.length) {
      const { data: pl } = await supabase
        .from('players').select('id, full_name').in('id', playerIds);
      (pl ?? []).forEach((p) => { nameById[p.id] = p.full_name; });
    }

    const b = {};
    Object.entries(bySession).forEach(([dk, players]) => {
      b[dk] = Object.entries(players).map(([pid, sess]) => {
        let bestVal = 0;
        Object.values(sess).forEach((atts) => {
          const v = summarize(dk, atts).value;
          if (v > bestVal) bestVal = v;
        });
        return {
          player_id: pid,
          full_name: nameById[pid] ?? 'Unknown player',
          value: bestVal,
          sessions: Object.keys(sess).length,
        };
      }).sort((a, z) => z.value - a.value);
    });
    setBest(b);
    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]);

  async function createSession(drillKey) {
    setError('');
    if (!activeSeason) { setError('No active season is set. Ask your coach to set one.'); return; }
    setCreating(true);
    const d = DRILLS[drillKey];
    const { data: sess } = await supabase.auth.getUser();
    const { data, error: ie } = await supabase
      .from('putting_sessions')
      .insert({
        season_id: activeSeason.id,
        drill_key: drillKey,
        label: d.name,
        config: d.defaultConfig,
        played_on: playedOn,
        status: 'in_progress',
        created_by: sess?.user?.id ?? null,
      })
      .select()
      .single();
    setCreating(false);
    if (ie) { setError(ie.message); return; }
    navigate(`/putting/${data.id}`);
  }

  if (loading) return <div className="content"><p className="muted">Loading putting drills…</p></div>;

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Practice green</p>
        <h2>Putting Drills</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Scored putting sessions with live leaderboards. Everything here stays
          separate from your round stats — this is practice-green data only.
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      {Object.entries(DRILLS).map(([key, d]) => (
        <div key={key} className="card" style={{ padding: 14 }}>
          <div className="row-between">
            <div style={{ flex: 1 }}>
              <strong>{d.name}</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{d.tagline}</div>
            </div>
            {formKey !== key && (
              <button
                onClick={() => setFormKey(key)}
                style={{ width: 'auto', minHeight: 36, fontSize: 13, padding: '0 14px' }}
              >Start</button>
            )}
          </div>
          {formKey === key && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                {d.describe(d.defaultConfig)}
              </p>
              <label>Date</label>
              <input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
              <div className="spacer" />
              <button onClick={() => createSession(key)} disabled={creating}>
                {creating ? 'Starting…' : `Start ${d.name}`}
              </button>
              <div className="spacer" />
              <button className="secondary" onClick={() => setFormKey(null)}>Cancel</button>
            </div>
          )}
        </div>
      ))}

      {sessions.length > 0 && (
        <>
          <p className="eyebrow">Sessions</p>
          {sessions.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/putting/${s.id}`)}
            >
              <div className="row-between">
                <div>
                  <strong>{s.label}</strong>
                  <div className="muted">{s.played_on}</div>
                </div>
                <span className="chip even">
                  {s.status === 'complete' ? 'done' : 'live'}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {Object.keys(best).length > 0 && (
        <>
          <p className="eyebrow">Season bests</p>
          {Object.entries(best).map(([dk, list]) => (
            <div key={dk} className="card" style={{ padding: 12 }}>
              <strong>{DRILLS[dk]?.name ?? dk}</strong>
              {list.map((p, i) => (
                <div
                  key={p.player_id}
                  className="row-between"
                  style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                >
                  <div>
                    <span>{i + 1}. {p.full_name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}· {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>
                  <strong>{p.value} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{DRILLS[dk]?.scoreLabel}</span></strong>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================================================
   PLAY — big tap targets, one row per putt, live leaderboard
   ============================================================ */

function PuttingPlay({ sessionId }) {
  const { user, isCoach } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [attempts, setAttempts] = useState([]);   // my attempts, in order
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('play');         // 'play' | 'board'
  const [board, setBoard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s, error: se } = await supabase
        .from('putting_sessions')
        .select('id, drill_key, label, config, played_on, status, created_by')
        .eq('id', sessionId)
        .single();
      if (se) { setError(se.message); setLoading(false); return; }
      setSession(s);

      const { data: p } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (p) {
        setPlayerId(p.id);
        const { data: mine } = await supabase
          .from('putting_attempts')
          .select('attempt_number, outcome, points, distance_ft')
          .eq('session_id', sessionId)
          .eq('player_id', p.id)
          .order('attempt_number');
        setAttempts(mine ?? []);
      }
      setLoading(false);
    })();
  }, [sessionId, user.id]);

  async function loadBoard() {
    setBoardLoading(true);
    const { data: rows } = await supabase
      .from('putting_attempts')
      .select('player_id, attempt_number, outcome, points')
      .eq('session_id', sessionId)
      .order('attempt_number');

    const byPlayer = {};
    (rows ?? []).forEach((r) => {
      byPlayer[r.player_id] ??= [];
      byPlayer[r.player_id].push(r);
    });
    const ids = Object.keys(byPlayer);
    if (!ids.length) { setBoard([]); setBoardLoading(false); return; }

    const { data: pl } = await supabase
      .from('players').select('id, full_name').in('id', ids);
    const nameById = {};
    (pl ?? []).forEach((p) => { nameById[p.id] = p.full_name; });

    const dk = session?.drill_key;
    const list = ids.map((id) => ({
      player_id: id,
      full_name: nameById[id] ?? 'Unknown player',
      ...summarize(dk, byPlayer[id]),
    }));
    list.sort((a, b) => b.value - a.value || a.attempts - b.attempts);
    setBoard(list);
    setBoardLoading(false);
  }

  useEffect(() => {
    if (tab !== 'board' || !session) return;
    loadBoard();
    const channel = supabase
      .channel(`putting-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'putting_attempts' },
        () => { loadBoard(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, session, sessionId]);

  const drill = session ? DRILLS[session.drill_key] : null;
  const config = session?.config ?? {};
  const limit = session ? attemptLimit(session.drill_key, config) : null;
  const done = limit != null && attempts.length >= limit;
  const { best, cur } = streaks(attempts);
  const gateDone = session?.drill_key === 'gate' && best >= (config.streak_target ?? 10);
  const totalPoints = attempts.reduce((s, a) => s + a.points, 0);

  async function logAttempt(outcome) {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    if (saving || done) return;
    setSaving(true);
    setError('');
    const n = attempts.length + 1;
    const row = {
      session_id: sessionId,
      player_id: playerId,
      attempt_number: n,
      distance_ft: distanceForAttempt(session.drill_key, config, attempts.length),
      outcome,
      points: pointsFor(session.drill_key, outcome),
    };
    const { error: ie } = await supabase
      .from('putting_attempts')
      .upsert(row, { onConflict: 'session_id,player_id,attempt_number' });
    setSaving(false);
    if (ie) { setError(ie.message); return; }
    setAttempts((prev) => [...prev, row]);
  }

  async function undoLast() {
    if (!attempts.length || saving) return;
    setSaving(true);
    const last = attempts[attempts.length - 1];
    const { error: de } = await supabase
      .from('putting_attempts')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .eq('attempt_number', last.attempt_number);
    setSaving(false);
    if (de) { setError(de.message); return; }
    setAttempts((prev) => prev.slice(0, -1));
  }

  async function deleteSession() {
    const { error: de } = await supabase
      .from('putting_sessions').delete().eq('id', sessionId);
    if (de) { setError(de.message); return; }
    navigate('/putting');
  }

  if (loading) return <div className="content"><p className="muted">Loading session…</p></div>;
  if (error && !session) return <div className="content"><div className="error">{error}</div></div>;
  if (!session) return null;

  const three = drill.outcomes === 'three';
  const bigBtn = {
    minHeight: 64, fontSize: 17, fontWeight: 700, flex: 1,
  };

  return (
    <div className="content">
      <div className="card">
        <div className="row-between">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Putting drill · {session.played_on}</p>
            <h2 style={{ margin: '2px 0 0' }}>{drill.name}</h2>
          </div>
          <button
            className="secondary"
            onClick={() => navigate('/putting')}
            style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }}
          >Back</button>
        </div>
        <p className="muted" style={{ marginBottom: 0, marginTop: 6 }}>
          {drill.describe(config)}
        </p>
      </div>

      {/* play / leaderboard tabs — same pattern as the 100-yard challenge */}
      <div className="card" style={{ padding: 8, display: 'flex', gap: 6 }}>
        <button
          className={tab === 'play' ? '' : 'secondary'}
          style={{ flex: 1, minHeight: 38, fontSize: 14 }}
          onClick={() => setTab('play')}
        >My putts</button>
        <button
          className={tab === 'board' ? '' : 'secondary'}
          style={{ flex: 1, minHeight: 38, fontSize: 14 }}
          onClick={() => setTab('board')}
        >Leaderboard</button>
      </div>

      {error && <div className="error">{error}</div>}

      {tab === 'play' && (
        <>
          <div className="card">
            <div className="row-between">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {session.drill_key === 'gate' ? 'Current streak' : 'Putt'}
                </div>
                <div style={{ fontWeight: 800, fontSize: 26 }}>
                  {session.drill_key === 'gate'
                    ? cur
                    : `${Math.min(attempts.length + 1, limit ?? 999)} / ${limit}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {session.drill_key === 'gate' ? `Best (target ${config.streak_target ?? 10})` : drill.scoreLabel}
                </div>
                <div style={{ fontWeight: 800, fontSize: 26 }}>
                  {session.drill_key === 'gate' ? best : totalPoints}
                </div>
              </div>
            </div>
            {distanceForAttempt(session.drill_key, config, attempts.length) != null && !done && !gateDone && (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Next putt from <strong>{distanceForAttempt(session.drill_key, config, attempts.length)} ft</strong>
              </p>
            )}
          </div>

          {(done || gateDone) ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>
                {gateDone ? '🔒 Gate closed!' : 'Session complete'}
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {session.drill_key === 'gate'
                  ? `Best streak: ${best} in a row.`
                  : `Final: ${totalPoints} ${drill.scoreLabel} out of ${drill.maxPoints(config)}.`}
                {' '}Check the leaderboard to see how it stacks up.
              </p>
            </div>
          ) : (
            <div className="card">
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => logAttempt('holed')} disabled={saving} style={bigBtn}>
                  Holed ✓
                </button>
                {three && (
                  <button
                    onClick={() => logAttempt('zone')}
                    disabled={saving}
                    style={{ ...bigBtn, fontSize: 15 }}
                  >
                    Inside 3 ft
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => logAttempt('miss')}
                  disabled={saving}
                  style={bigBtn}
                >
                  Miss
                </button>
              </div>
            </div>
          )}

          {attempts.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div className="row-between">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                  {attempts.map((a) => (
                    <span
                      key={a.attempt_number}
                      title={`Putt ${a.attempt_number}`}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        background: a.outcome === 'holed'
                          ? 'var(--green-500)'
                          : a.outcome === 'zone' ? 'var(--green-100)' : 'var(--white)',
                        color: a.outcome === 'holed' ? 'var(--white)' : 'var(--green-700)',
                        border: '1.5px solid var(--green-500)',
                      }}
                    >
                      {a.outcome === 'holed' ? '●' : a.outcome === 'zone' ? '◐' : '○'}
                    </span>
                  ))}
                </div>
                <button
                  className="secondary"
                  onClick={undoLast}
                  disabled={saving}
                  style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px', marginLeft: 8 }}
                >Undo</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'board' && (
        <div className="card" style={{ padding: 12 }}>
          {boardLoading && <p className="muted" style={{ margin: 0 }}>Loading…</p>}
          {!boardLoading && board.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>No putts logged yet.</p>
          )}
          {board.map((p, i) => (
            <div
              key={p.player_id}
              className="row-between"
              style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
            >
              <div>
                <strong>{i + 1}. {p.full_name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{p.attempts} putts</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{p.value}</div>
                <div className="muted" style={{ fontSize: 11 }}>{drill.scoreLabel}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(isCoach || session.created_by === user.id) && (
        <div className="card" style={{ padding: 12 }}>
          {!confirmDelete ? (
            <button className="secondary" onClick={() => setConfirmDelete(true)} style={{ fontSize: 13, minHeight: 36 }}>
              Delete this session
            </button>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                This removes the session and every putt logged in it, for everyone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={deleteSession} style={{ flex: 1, minHeight: 36, fontSize: 13 }}>Yes, delete</button>
                <button className="secondary" onClick={() => setConfirmDelete(false)} style={{ flex: 1, minHeight: 36, fontSize: 13 }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
