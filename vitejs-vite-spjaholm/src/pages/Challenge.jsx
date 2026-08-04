import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import { yardsBetween } from '../lib/caddieMath.js';
import { formatToPar } from '../lib/scoring.js';

// How close to the target distance counts as "on the spot", in yards.
// GPS on a phone is good to a couple of yards on a clear day, so a
// tighter window than this just makes the readout twitchy.
const SPOT_TOLERANCE = 3;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Router entry point: /challenge shows the list, /challenge/:sessionId
// shows the scoring screen for one session.
export default function Challenge() {
  const { sessionId } = useParams();
  if (sessionId) return <ChallengePlay sessionId={sessionId} />;
  return <ChallengeList />;
}

/* ============================================================
   LIST — pick or start a session, and see season-long results
   ============================================================ */

function ChallengeList() {
  const { isCoach, seasonId, activeSeason } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [summary, setSummary] = useState([]);   // per-player season totals
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [distance, setDistance] = useState(100);
  const [holesChoice, setHolesChoice] = useState('full');
  const [playedOn, setPlayedOn] = useState(todayStr());
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError('');

    const { data: c } = await supabase
      .from('courses')
      .select('id, name, holes')
      .order('name');
    const courseList = c ?? [];
    setCourses(courseList);

    // Country Hills is where this drill actually gets played, so it's
    // the default — but any course can be picked.
    if (courseList.length && !courseId) {
      const ch = courseList.find((x) => /country hills/i.test(x.name));
      setCourseId(ch ? ch.id : courseList[0].id);
    }

    if (!seasonId) { setSessions([]); setSummary([]); setLoading(false); return; }

    const { data: s, error: se } = await supabase
      .from('drill_sessions')
      .select('id, played_on, status, start_distance_yards, target_per_hole, start_hole, end_hole, courses ( name )')
      .eq('season_id', seasonId)
      .order('played_on', { ascending: false });
    if (se) { setError(se.message); setLoading(false); return; }
    setSessions(s ?? []);

    // Season-long summary across every session in this season.
    const { data: rows } = await supabase
      .from('drill_scores')
      .select('player_id, session_id, strokes, hit_green, putts, drill_sessions!inner ( season_id, target_per_hole )')
      .eq('drill_sessions.season_id', seasonId);

    const byPlayer = {};
    (rows ?? []).forEach((r) => {
      const target = r.drill_sessions?.target_per_hole ?? 2;
      if (!byPlayer[r.player_id]) {
        byPlayer[r.player_id] = {
          player_id: r.player_id,
          holes: 0, strokes: 0, toTarget: 0,
          greens: 0, greenLogged: 0,
          onePutts: 0, puttLogged: 0,
          sessions: new Set(),
        };
      }
      const b = byPlayer[r.player_id];
      b.holes += 1;
      b.strokes += r.strokes;
      b.toTarget += r.strokes - target;
      b.sessions.add(r.session_id);
      if (r.hit_green != null) { b.greenLogged += 1; if (r.hit_green) b.greens += 1; }
      if (r.putts != null) { b.puttLogged += 1; if (r.putts <= 1) b.onePutts += 1; }
    });

    const ids = Object.keys(byPlayer);
    if (ids.length) {
      const { data: pl } = await supabase
        .from('players')
        .select('id, full_name, gender')
        .in('id', ids);
      const nameById = {};
      (pl ?? []).forEach((p) => { nameById[p.id] = p; });
      const list = ids.map((id) => ({
        ...byPlayer[id],
        full_name: nameById[id]?.full_name ?? 'Unknown player',
        gender: nameById[id]?.gender ?? null,
        sessionCount: byPlayer[id].sessions.size,
        avg: byPlayer[id].strokes / byPlayer[id].holes,
      }));
      list.sort((a, b) => a.avg - b.avg);
      setSummary(list);
    } else {
      setSummary([]);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const courseIs18 = selectedCourse?.holes === 18;

  async function createSession() {
    setError('');
    if (!activeSeason) { setError('No active season is set. Ask your coach to set one.'); return; }
    if (!courseId) { setError('Pick a course first.'); return; }
    setCreating(true);

    let startHole = 1;
    let endHole = selectedCourse?.holes ?? 18;
    if (courseIs18) {
      if (holesChoice === 'front') { startHole = 1; endHole = 9; }
      else if (holesChoice === 'back') { startHole = 10; endHole = 18; }
      else { startHole = 1; endHole = 18; }
    }

    const { data: sess } = await supabase.auth.getUser();

    const { data, error: ie } = await supabase
      .from('drill_sessions')
      .insert({
        season_id: activeSeason.id,
        course_id: courseId,
        drill_key: 'approach_100',
        label: `${Number(distance)}-Yard Challenge`,
        start_distance_yards: Number(distance),
        target_per_hole: 2,
        start_hole: startHole,
        end_hole: endHole,
        played_on: playedOn,
        status: 'in_progress',
        created_by: sess?.user?.id ?? null,
      })
      .select()
      .single();

    setCreating(false);
    if (ie) { setError(ie.message); return; }
    setShowForm(false);
    navigate(`/challenge/${data.id}`);
  }

  if (loading) return <div className="content"><p className="muted">Loading challenge…</p></div>;

  const holeCount = (s) => s.end_hole - s.start_hole + 1;

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Accuracy drill</p>
        <h2>100-Yard Challenge</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Start every hole 100 yards from the green. Target is <strong>2</strong> —
          one on, one putt. The app uses the course GPS to walk you to the
          exact spot, so nobody has to pace it off.
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        {!showForm ? (
          <button onClick={() => setShowForm(true)}>+ Start a session</button>
        ) : (
          <>
            <h2>New session</h2>
            {courses.length === 0 ? (
              <p className="muted">No courses available yet.</p>
            ) : (
              <>
                <label>Course</label>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.holes} holes)</option>
                  ))}
                </select>

                {courseIs18 && (
                  <>
                    <label>Holes</label>
                    <select value={holesChoice} onChange={(e) => setHolesChoice(e.target.value)}>
                      <option value="full">Full 18 (target 36)</option>
                      <option value="front">Front 9 (target 18)</option>
                      <option value="back">Back 9 (target 18)</option>
                    </select>
                  </>
                )}

                <label>Distance from the green</label>
                <select value={distance} onChange={(e) => setDistance(e.target.value)}>
                  <option value={50}>50 yards</option>
                  <option value={75}>75 yards</option>
                  <option value={100}>100 yards</option>
                  <option value={125}>125 yards</option>
                  <option value={150}>150 yards</option>
                </select>

                <label>Date</label>
                <input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />

                <div className="spacer" />
                <button onClick={createSession} disabled={creating}>
                  {creating ? 'Starting…' : 'Start session'}
                </button>
                <div className="spacer" />
                <button className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </>
            )}
          </>
        )}
      </div>

      <p className="eyebrow">Sessions</p>
      {sessions.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No sessions this season yet. Start one above when you're on the
            course and everyone can join it from their own phone.
          </p>
        </div>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/challenge/${s.id}`)}
        >
          <div className="row-between">
            <div>
              <strong>{s.courses?.name ?? 'Course'}</strong>
              <div className="muted">
                {s.played_on} · {holeCount(s)} holes · target {holeCount(s) * s.target_per_hole}
              </div>
            </div>
            <span className="chip even">{s.start_distance_yards} yds</span>
          </div>
        </div>
      ))}

      {summary.length > 0 && (
        <>
          <p className="eyebrow">Season results</p>
          <div className="card" style={{ padding: 12 }}>
            <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 10 }}>
              Everything below is from challenge sessions only — it never
              touches regular scoring averages.
            </p>
            {summary.map((p, i) => {
              const greenPct = p.greenLogged ? Math.round((p.greens / p.greenLogged) * 100) : null;
              const onePuttPct = p.puttLogged ? Math.round((p.onePutts / p.puttLogged) * 100) : null;
              return (
                <div
                  key={p.player_id}
                  style={{
                    padding: '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div className="row-between">
                    <div>
                      <strong>{p.full_name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.sessionCount} {p.sessionCount === 1 ? 'session' : 'sessions'} · {p.holes} holes
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 17 }}>
                        {p.avg.toFixed(2)}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>per hole</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 13 }}>
                    <span>
                      <strong>{greenPct == null ? '—' : `${greenPct}%`}</strong>
                      <span className="muted"> greens</span>
                    </span>
                    <span>
                      <strong>{onePuttPct == null ? '—' : `${onePuttPct}%`}</strong>
                      <span className="muted"> 1-putt</span>
                    </span>
                    <span>
                      <strong>{formatToPar(p.toTarget)}</strong>
                      <span className="muted"> vs target</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {isCoach && summary.length > 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Greens % is the honest measure of the drill — a 3 from missing the
            green is a different problem than a 3 from three-putting.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PLAY — GPS finder, hole-by-hole scoring, live leaderboard
   ============================================================ */

function ChallengePlay({ sessionId }) {
  const { user, isCoach } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [scores, setScores] = useState({});      // hole -> {strokes, hit_green, putts}
  const [coords, setCoords] = useState({});      // hole -> green coords
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [tab, setTab] = useState('play');        // 'play' | 'board'
  const [hole, setHole] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // leaderboard rows
  const [board, setBoard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);

  // live GPS — same watcher pattern used by Caddie and Practice mode
  const [pos, setPos] = useState(null);
  const [gpsErr, setGpsErr] = useState('');
  const watchId = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s, error: se } = await supabase
        .from('drill_sessions')
        .select('id, played_on, status, course_id, start_distance_yards, target_per_hole, start_hole, end_hole, label, courses ( name, holes )')
        .eq('id', sessionId)
        .single();
      if (se) { setError(se.message); setLoading(false); return; }
      setSession(s);
      setHole(s.start_hole ?? 1);

      const { data: p } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (p) {
        setPlayerId(p.id);
        const { data: existing } = await supabase
          .from('drill_scores')
          .select('hole_number, strokes, hit_green, putts')
          .eq('session_id', sessionId)
          .eq('player_id', p.id);
        const map = {};
        (existing ?? []).forEach((r) => {
          map[r.hole_number] = {
            strokes: r.strokes,
            hit_green: r.hit_green,
            putts: r.putts,
          };
        });
        setScores(map);

        // Jump to the first hole that hasn't been entered yet.
        const start = s.start_hole ?? 1;
        const end = s.end_hole ?? 18;
        let next = start;
        while (next <= end && map[next]) next += 1;
        setHole(next > end ? end : next);
      }

      if (s.course_id) {
        const { data: cData } = await supabase
          .from('hole_coordinates')
          .select('hole_number, front_lat, front_lng, center_lat, center_lng')
          .eq('course_id', s.course_id);
        const cMap = {};
        (cData ?? []).forEach((r) => { cMap[r.hole_number] = r; });
        setCoords(cMap);
      }

      setLoading(false);
    })();
  }, [sessionId, user.id]);

  // GPS runs the whole time on this screen — finding the spot is the
  // point of the drill, so there's nothing to gain by gating it.
  useEffect(() => {
    if (!navigator.geolocation) { setGpsErr('This device has no GPS.'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setGpsErr('');
      },
      (e) => setGpsErr(e.message || 'Location unavailable. Allow location access and try outside.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, []);

  async function loadBoard() {
    setBoardLoading(true);
    const { data: rows } = await supabase
      .from('drill_scores')
      .select('player_id, hole_number, strokes, hit_green, putts')
      .eq('session_id', sessionId);

    const byPlayer = {};
    (rows ?? []).forEach((r) => {
      if (!byPlayer[r.player_id]) {
        byPlayer[r.player_id] = {
          player_id: r.player_id, holes: 0, strokes: 0,
          greens: 0, greenLogged: 0, onePutts: 0, puttLogged: 0,
        };
      }
      const b = byPlayer[r.player_id];
      b.holes += 1;
      b.strokes += r.strokes;
      if (r.hit_green != null) { b.greenLogged += 1; if (r.hit_green) b.greens += 1; }
      if (r.putts != null) { b.puttLogged += 1; if (r.putts <= 1) b.onePutts += 1; }
    });

    const ids = Object.keys(byPlayer);
    if (!ids.length) { setBoard([]); setBoardLoading(false); return; }

    const { data: pl } = await supabase
      .from('players')
      .select('id, full_name')
      .in('id', ids);
    const nameById = {};
    (pl ?? []).forEach((p) => { nameById[p.id] = p.full_name; });

    const target = session?.target_per_hole ?? 2;
    const list = ids.map((id) => {
      const b = byPlayer[id];
      return {
        ...b,
        full_name: nameById[id] ?? 'Unknown player',
        toTarget: b.strokes - b.holes * target,
      };
    });
    list.sort((a, b) => a.toTarget - b.toTarget || b.holes - a.holes);
    setBoard(list);
    setBoardLoading(false);
  }

  useEffect(() => {
    if (tab !== 'board' || !session) return;
    loadBoard();
    const channel = supabase
      .channel(`drill-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drill_scores' },
        () => { loadBoard(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, session, sessionId]);

  function current() {
    return scores[hole] ?? { strokes: session?.target_per_hole ?? 2, hit_green: null, putts: 1 };
  }

  function adjust(field, delta, min, max) {
    setScores((prev) => {
      const cur = prev[hole] ?? { strokes: session?.target_per_hole ?? 2, hit_green: null, putts: 1 };
      const next = Math.min(max, Math.max(min, (cur[field] ?? 0) + delta));
      return { ...prev, [hole]: { ...cur, [field]: next } };
    });
  }

  function toggleGreen() {
    setScores((prev) => {
      const cur = prev[hole] ?? { strokes: session?.target_per_hole ?? 2, hit_green: null, putts: 1 };
      const next = cur.hit_green === null || cur.hit_green === undefined
        ? true
        : cur.hit_green === true ? false : null;
      return { ...prev, [hole]: { ...cur, hit_green: next } };
    });
  }

  async function saveHole() {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    setError('');
    const h = current();
    const { error: ue } = await supabase
      .from('drill_scores')
      .upsert(
        {
          session_id: sessionId,
          player_id: playerId,
          hole_number: hole,
          strokes: h.strokes,
          hit_green: h.hit_green,
          putts: h.putts,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,player_id,hole_number' }
      );
    if (ue) { setError(ue.message); return; }

    setScores((prev) => ({ ...prev, [hole]: h }));
    setSavedNote(`Hole ${hole} saved`);
    setTimeout(() => setSavedNote(''), 1500);

    const end = session.end_hole ?? 18;
    if (hole < end) setHole(hole + 1);
  }

  async function deleteSession() {
    const { error: de } = await supabase.from('drill_sessions').delete().eq('id', sessionId);
    if (de) { setError(de.message); return; }
    navigate('/challenge');
  }

  if (loading) return <div className="content"><p className="muted">Loading session…</p></div>;
  if (error && !session) return <div className="content"><div className="error">{error}</div></div>;

  const startHole = session.start_hole ?? 1;
  const endHole = session.end_hole ?? 18;
  const target = session.target_per_hole ?? 2;
  const wanted = session.start_distance_yards ?? 100;

  const holeNumbers = [];
  for (let h = startHole; h <= endHole; h++) holeNumbers.push(h);

  const played = holeNumbers.filter((h) => scores[h]);
  const totalStrokes = played.reduce((sum, h) => sum + scores[h].strokes, 0);
  const toTarget = totalStrokes - played.length * target;

  // ---- the finder ----
  const gc = coords[hole] ?? {};
  const holeMapped = gc.center_lat != null;
  const rawDist = pos && holeMapped
    ? yardsBetween(pos.lat, pos.lng, gc.center_lat, gc.center_lng)
    : null;
  const distToGreen = rawDist == null ? null : Math.round(rawDist);
  const offBy = distToGreen == null ? null : distToGreen - wanted;
  const onSpot = offBy != null && Math.abs(offBy) <= SPOT_TOLERANCE;

  let finderBg = 'var(--white)';
  let finderMsg = 'Getting your location…';
  if (gpsErr) {
    finderMsg = gpsErr;
    finderBg = '#f6dcd9';
  } else if (!holeMapped) {
    finderMsg = `Hole ${hole} isn't mapped on this course yet — pace it off for now.`;
    finderBg = 'var(--white)';
  } else if (offBy == null) {
    finderMsg = 'Getting your location…';
  } else if (onSpot) {
    finderMsg = `You're on the spot — hit it.`;
    finderBg = 'var(--green-100)';
  } else if (offBy > 0) {
    finderMsg = `Walk forward ${offBy} yds toward the green.`;
    finderBg = '#fff4e0';
  } else {
    finderMsg = `Walk back ${Math.abs(offBy)} yds away from the green.`;
    finderBg = '#fff4e0';
  }

  const h = current();
  const saved = !!scores[hole];
  const diff = h.strokes - target;
  const chipClass = diff < 0 ? 'under' : diff > 0 ? 'over' : 'even';

  const TabBtn = ({ id, children }) => (
    <button
      className={tab === id ? '' : 'secondary'}
      style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 14px' }}
      onClick={() => setTab(id)}
    >{children}</button>
  );

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">
          {session.courses?.name} · {session.played_on} · {holeNumbers.length} holes
        </p>
        <h2 style={{ marginBottom: 6 }}>{wanted}-Yard Challenge</h2>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="n">{played.length ? totalStrokes : '—'}</div>
            <div className="l">Strokes · thru {played.length}</div>
          </div>
          <div className="stat-box">
            <div className="n">{played.length ? formatToPar(toTarget) : '—'}</div>
            <div className="l">vs target ({holeNumbers.length * target})</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <TabBtn id="play">Play</TabBtn>
          <TabBtn id="board">Leaderboard</TabBtn>
          <button
            className="secondary"
            style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }}
            onClick={() => navigate('/challenge')}
          >
            ← All sessions
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {savedNote && <div className="success">{savedNote}</div>}
      {!playerId && (
        <div className="error">
          You aren't linked to the roster, so scores can't save. Ask your coach
          to add you.
        </div>
      )}

      {tab === 'play' && (
        <>
          {/* ---- hole picker ---- */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
              {holeNumbers.map((n) => {
                const s = scores[n];
                const d = s ? s.strokes - target : null;
                const bg = n === hole
                  ? 'var(--green-500)'
                  : d == null ? 'var(--white)'
                  : d < 0 ? '#8e44ad'
                  : d === 0 ? 'var(--green-100)'
                  : d === 1 ? '#f6dcd9'
                  : 'var(--flag)';
                const color = n === hole
                  ? 'var(--white)'
                  : d == null ? 'var(--muted)'
                  : d < 0 || d > 1 ? 'var(--white)'
                  : 'var(--ink)';
                return (
                  <button
                    key={n}
                    onClick={() => setHole(n)}
                    style={{
                      width: 'auto', minWidth: 38, minHeight: 44, padding: 0,
                      flexDirection: 'column', fontSize: 11, fontWeight: 700,
                      background: bg, color,
                      border: n === hole ? 'none' : '1px solid var(--line)',
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.85 }}>{n}</span>
                    <span style={{ fontSize: 14 }}>{s ? s.strokes : '·'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- the 100-yard finder ---- */}
          <div className="card" style={{ background: finderBg }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>Find your spot — hole {hole}</p>
            <div className="row-between" style={{ alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
                  {distToGreen == null ? '—' : distToGreen}
                  <span style={{ fontSize: 15, fontWeight: 600 }} className="muted"> yds to center</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 600 }}>
                  {onSpot ? '✓ ' : ''}{finderMsg}
                </p>
              </div>
            </div>
            {pos && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                GPS ±{Math.round(pos.acc)} m
                {pos.acc > 12 && ' — weak fix. Close and reopen the app to reset it.'}
              </p>
            )}
          </div>

          {/* ---- scoring ---- */}
          <div className="card">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div>
                <span className="hole-num">Hole {hole}</span>
                <span className="hole-par"> · target {target}</span>
              </div>
              <div className={`chip ${chipClass}`}>{formatToPar(diff)}</div>
            </div>

            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="muted" style={{ width: 90 }}>Score</span>
              <div className="stepper">
                <button className="secondary" onClick={() => adjust('strokes', -1, 1, 15)}>−</button>
                <span className="val">{h.strokes}</span>
                <button className="secondary" onClick={() => adjust('strokes', +1, 1, 15)}>+</button>
              </div>
            </div>

            <div className="row-between" style={{ marginBottom: 10 }}>
              <span className="muted" style={{ width: 90 }}>Putts</span>
              <div className="stepper">
                <button className="secondary" onClick={() => adjust('putts', -1, 0, 10)}>−</button>
                <span className="val">{h.putts ?? '—'}</span>
                <button className="secondary" onClick={() => adjust('putts', +1, 0, 10)}>+</button>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <button
                onClick={toggleGreen}
                style={{
                  width: '100%', minHeight: 44, fontSize: 14,
                  background: h.hit_green === true ? 'var(--green-500)'
                    : h.hit_green === false ? 'var(--flag)' : 'var(--white)',
                  color: h.hit_green == null ? 'var(--muted)' : 'var(--white)',
                  border: h.hit_green == null ? '1.5px solid var(--line)' : 'none',
                }}
              >
                {h.hit_green === true ? 'Approach hit the green ✓'
                  : h.hit_green === false ? 'Missed the green ✗'
                  : 'Did the approach hit the green?'}
              </button>
              <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                Tap once for hit, again for miss, again to clear.
              </p>
            </div>

            <button onClick={saveHole}>
              {saved ? `Update hole ${hole}` : `Save hole ${hole}`}
              {hole < endHole ? ' → next' : ''}
            </button>
          </div>

          {isCoach && (
            <div className="card">
              {!confirmDelete ? (
                <button
                  className="secondary"
                  style={{ color: 'var(--flag)', borderColor: 'var(--flag)' }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete this session
                </button>
              ) : (
                <>
                  <p className="muted" style={{ marginBottom: 10 }}>
                    Delete this session and every player's scores in it? This
                    can't be undone.
                  </p>
                  <button style={{ background: 'var(--flag)' }} onClick={deleteSession}>
                    Yes, delete it
                  </button>
                  <div className="spacer" />
                  <button className="secondary" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'board' && (
        <>
          <p className="eyebrow">Live leaderboard</p>
          {boardLoading && <div className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></div>}
          {!boardLoading && board.length === 0 && (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Nobody's posted a hole yet. Players show up here the moment they
                save their first one.
              </p>
            </div>
          )}
          {board.map((p, i) => {
            const greenPct = p.greenLogged ? Math.round((p.greens / p.greenLogged) * 100) : null;
            const onePuttPct = p.puttLogged ? Math.round((p.onePutts / p.puttLogged) * 100) : null;
            const isMe = p.player_id === playerId;
            return (
              <div
                key={p.player_id}
                className="card"
                style={{
                  padding: 12,
                  border: isMe ? '2px solid var(--green-500)' : undefined,
                }}
              >
                <div className="row-between">
                  <div>
                    <strong>
                      <span className="muted" style={{ marginRight: 6 }}>{i + 1}.</span>
                      {p.full_name}
                    </strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.strokes} strokes · thru {p.holes}
                    </div>
                  </div>
                  <div className="chip even" style={{ fontSize: 15, fontWeight: 800 }}>
                    {formatToPar(p.toTarget)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 13 }}>
                  <span>
                    <strong>{greenPct == null ? '—' : `${greenPct}%`}</strong>
                    <span className="muted"> greens</span>
                  </span>
                  <span>
                    <strong>{onePuttPct == null ? '—' : `${onePuttPct}%`}</strong>
                    <span className="muted"> 1-putt</span>
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
