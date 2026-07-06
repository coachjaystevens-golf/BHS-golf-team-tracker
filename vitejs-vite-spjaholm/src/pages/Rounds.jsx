import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

export default function Rounds() {
  const { isCoach, seasons, seasonId, setSeasonId, activeSeason } = useAuth();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [type, setType] = useState('match');
  const [holesChoice, setHolesChoice] = useState('full'); // 'full' | 'front' | 'back'
  const [playedOn, setPlayedOn] = useState(
    new Date().toISOString().slice(0, 10)
  );
  // match lineup + counting rules
  const [allPlayers, setAllPlayers] = useState([]);       // {id, full_name, gender}
  const [lineup, setLineup] = useState({});               // { [playerId]: true }
  const [boysCount, setBoysCount] = useState(4);          // scores that count
  const [girlsCount, setGirlsCount] = useState(2);

  async function load() {
    if (!seasonId) { setRounds([]); setLoading(false); return; }
    setLoading(true);
    const { data: r, error: re } = await supabase
      .from('rounds')
      .select('id, played_on, type, start_hole, end_hole, courses ( name )')
      .eq('season_id', seasonId)
      .order('played_on', { ascending: false });
    const { data: c } = await supabase
      .from('courses')
      .select('id, name, holes')
      .order('name');
    if (re) setError(re.message);
    setRounds(r ?? []);
    setCourses(c ?? []);
    if (c?.length && !courseId) setCourseId(c[0].id);

    // players available for match lineups (coach only)
    if (isCoach) {
      const { data: pl } = await supabase
        .from('players')
        .select('id, full_name, gender')
        .eq('archived', false)
        .order('gender')
        .order('full_name');
      setAllPlayers(pl ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const courseIs18 = selectedCourse?.holes === 18;

  async function createRound() {
    setError('');
    if (!activeSeason) {
      setError('No active season is set. Ask your coach to set one.');
      return;
    }
    const roundType = isCoach ? type : 'practice';

    // figure out the hole range
    let startHole = 1;
    let endHole = selectedCourse?.holes ?? 18;
    if (courseIs18) {
      if (holesChoice === 'front') { startHole = 1; endHole = 9; }
      else if (holesChoice === 'back') { startHole = 10; endHole = 18; }
      else { startHole = 1; endHole = 18; }
    }

    const { data, error } = await supabase
      .from('rounds')
      .insert({
        course_id: courseId,
        type: roundType,
        played_on: playedOn,
        season_id: activeSeason.id,
        start_hole: startHole,
        end_hole: endHole,
        boys_count: roundType === 'match' ? Number(boysCount) : null,
        girls_count: roundType === 'match' ? Number(girlsCount) : null,
      })
      .select()
      .single();
    if (error) { setError(error.message); return; }

    // For matches, save the designated lineup.
    if (roundType === 'match') {
      const rows = allPlayers
        .filter((p) => lineup[p.id])
        .map((p) => ({ round_id: data.id, player_id: p.id, team: p.gender }));
      if (rows.length > 0) {
        const { error: le } = await supabase.from('round_lineup').insert(rows);
        if (le) { setError('Round created, but lineup failed to save: ' + le.message); return; }
      }
    }

    setShowForm(false);
    navigate(`/round/${data.id}`);
  }

  if (loading) return <div className="content"><p className="muted">Loading rounds…</p></div>;

  const visibleRounds = rounds.filter((r) => {
    if (filter === 'all') return true;
    return r.type === filter;
  });

  const viewingActive = activeSeason && seasonId === activeSeason.id;

  // label for a round's hole range
  const rangeLabel = (r) => {
    if (r.start_hole === 1 && r.end_hole === 9) return 'Front 9';
    if (r.start_hole === 10 && r.end_hole === 18) return 'Back 9';
    if (r.start_hole === 1 && r.end_hole === 9) return '9 holes';
    const count = r.end_hole - r.start_hole + 1;
    return count === 9 ? '9 holes' : '18 holes';
  };

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}

      {seasons.length > 0 && (
        <div className="card">
          <label>Season</label>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.is_active ? ' (current)' : ''}
              </option>
            ))}
          </select>
          {!viewingActive && (
            <p className="muted" style={{ marginTop: 8 }}>
              You're viewing a past season. New rounds still go to the
              current season.
            </p>
          )}
          <div className="spacer" />
          <button className="secondary" onClick={load}>↻ Refresh</button>
        </div>
      )}

      <div className="card">
        {!showForm ? (
          <button onClick={() => setShowForm(true)}>
            {isCoach ? '+ New round' : '+ New practice round'}
          </button>
        ) : (
          <>
            <h2>{isCoach ? 'New round' : 'New practice round'}</h2>
            {courses.length === 0 ? (
              <p className="muted">
                {isCoach
                  ? 'Add a course first (Coach tab) before creating a round.'
                  : 'No courses available yet. Ask your coach to add one.'}
              </p>
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
                      <option value="full">Full 18</option>
                      <option value="front">Front 9 (holes 1–9)</option>
                      <option value="back">Back 9 (holes 10–18)</option>
                    </select>
                  </>
                )}

                {isCoach && (
                  <>
                    <label>Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value)}>
                      <option value="match">Match</option>
                      <option value="practice">Practice</option>
                    </select>
                  </>
                )}

                {isCoach && type === 'match' && (
                  <LineupPicker
                    allPlayers={allPlayers}
                    lineup={lineup}
                    setLineup={setLineup}
                    boysCount={boysCount}
                    setBoysCount={setBoysCount}
                    girlsCount={girlsCount}
                    setGirlsCount={setGirlsCount}
                  />
                )}

                <label>Date</label>
                <input type="date" value={playedOn}
                  onChange={(e) => setPlayedOn(e.target.value)} />

                <div className="spacer" />
                <button onClick={createRound}>
                  {isCoach ? 'Create round' : 'Create practice round'}
                </button>
                <div className="spacer" />
                <button className="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={filter === 'all' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('all')}
          >All</button>
          <button
            className={filter === 'match' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('match')}
          >Matches</button>
          <button
            className={filter === 'practice' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('practice')}
          >Practice</button>
        </div>
      </div>

      <p className="eyebrow">Rounds</p>
      {visibleRounds.length === 0 && (
        <div className="card">
          <p className="muted">
            {rounds.length === 0
              ? (isCoach ? 'No rounds in this season yet. Create one above to get started.'
                         : 'No rounds in this season yet. Create a practice round above, or your coach will set up matches.')
              : 'No rounds match this filter.'}
          </p>
        </div>
      )}

      {visibleRounds.map((r) => (
        <div key={r.id} className="card" onClick={() => navigate(`/round/${r.id}`)}
             style={{ cursor: 'pointer' }}>
          <div className="row-between">
            <div>
              <strong>{r.courses?.name ?? 'Course'}</strong>
              <div className="muted">{r.played_on} · {rangeLabel(r)}</div>
            </div>
            <span className="chip even" style={{ textTransform: 'capitalize' }}>
              {r.type}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}


// ---- LineupPicker: coach designates who's in a match + counting rules ----
function LineupPicker({
  allPlayers, lineup, setLineup,
  boysCount, setBoysCount, girlsCount, setGirlsCount,
}) {
  const boys = allPlayers.filter((p) => p.gender === 'boys');
  const girls = allPlayers.filter((p) => p.gender === 'girls');
  const boysPicked = boys.filter((p) => lineup[p.id]).length;
  const girlsPicked = girls.filter((p) => lineup[p.id]).length;

  const toggle = (id) =>
    setLineup((prev) => ({ ...prev, [id]: !prev[id] }));

  const Team = ({ title, players, picked, count, setCount }) => (
    <div style={{ marginTop: 12 }}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{picked} playing</span>
      </div>
      {players.length === 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
          No players on this team yet.
        </p>
      )}
      {players.map((p) => (
        <label
          key={p.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', fontWeight: 400, cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!lineup[p.id]}
            onChange={() => toggle(p.id)}
            style={{ width: 18, height: 18 }}
          />
          {p.full_name}
        </label>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 13 }}>Scores that count:</span>
        <input
          type="number"
          min="1"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          style={{ width: 60 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          (top {count} of {picked || '—'})
        </span>
      </div>
    </div>
  );

  return (
    <div
      className="card"
      style={{ marginTop: 12, background: 'var(--green-100, #e4f3e7)' }}
    >
      <strong style={{ fontSize: 14 }}>Match lineup</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
        Pick who's playing. The live board and team totals use only these
        players; the top scores you set below count toward the team.
      </p>
      <Team
        title="Boys"
        players={boys}
        picked={boysPicked}
        count={boysCount}
        setCount={setBoysCount}
      />
      <Team
        title="Girls"
        players={girls}
        picked={girlsPicked}
        count={girlsCount}
        setCount={setGirlsCount}
      />
    </div>
  );
}
