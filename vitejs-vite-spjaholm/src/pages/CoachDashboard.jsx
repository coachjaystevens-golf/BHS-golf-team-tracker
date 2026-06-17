import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { roundTotal, teamScore, formatToPar, toPar } from '../lib/scoring.js';

export default function CoachDashboard() {
  const [tab, setTab] = useState('team');

  const tabStyle = { fontSize: 13, padding: '0 6px' };

  return (
    <div className="content">
      <div className="card">
        <div style={{ display: 'flex', gap: 5 }}>
          <button className={tab === 'team' ? '' : 'secondary'} style={tabStyle} onClick={() => setTab('team')}>Scores</button>
          <button className={tab === 'roster' ? '' : 'secondary'} style={tabStyle} onClick={() => setTab('roster')}>Roster</button>
          <button className={tab === 'courses' ? '' : 'secondary'} style={tabStyle} onClick={() => setTab('courses')}>Courses</button>
          <button className={tab === 'seasons' ? '' : 'secondary'} style={tabStyle} onClick={() => setTab('seasons')}>Seasons</button>
        </div>
      </div>

      {tab === 'team' && <TeamScores />}
      {tab === 'roster' && <Roster />}
      {tab === 'courses' && <Courses />}
      {tab === 'seasons' && <Seasons />}
    </div>
  );
}

function TeamScores() {
  const [rounds, setRounds] = useState([]);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, played_on, type, courses ( name )')
        .order('played_on', { ascending: false });
      setRounds(data ?? []);
      if (data?.length) setSelected(data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('scores')
        .select('strokes, hole_number, players ( id, full_name, gender ), rounds ( courses ( par_per_hole ) )')
        .eq('round_id', selected);

      const byPlayer = {};
      let par = [];
      for (const r of rows ?? []) {
        par = r.rounds?.courses?.par_per_hole ?? par;
        const pid = r.players?.id;
        if (!pid) continue;
        if (!byPlayer[pid]) {
          byPlayer[pid] = {
            player_id: pid,
            full_name: r.players.full_name,
            gender: r.players.gender,
            scores: [],
          };
        }
        byPlayer[pid].scores.push({ hole_number: r.hole_number, strokes: r.strokes });
      }

      const all = Object.values(byPlayer).map((p) => ({
        ...p,
        total: roundTotal(p.scores),
        tp: toPar(p.scores, par),
      }));

      const boys = all.filter((p) => p.gender === 'boys');
      const girls = all.filter((p) => p.gender === 'girls');

      setResult({
        boys: teamScore(boys, 'boys'),
        girls: teamScore(girls, 'girls'),
        boysList: boys,
        girlsList: girls,
      });
      setLoading(false);
    })();
  }, [selected]);

  return (
    <>
      <div className="card">
        <label>Round</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.courses?.name} · {r.played_on} · {r.type}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="muted">Calculating…</p>}

      {result && (
        <>
          <TeamCard title="Boys — top 4 of 5" data={result.boys} list={result.boysList} />
          <TeamCard title="Girls — top 2 of 3" data={result.girls} list={result.girlsList} />
        </>
      )}
    </>
  );
}

function TeamCard({ title, data, list }) {
  const droppedIds = new Set(data.dropped.map((p) => p.player_id));
  return (
    <div className="card">
      <h2>{title}</h2>
      {list.length === 0 ? (
        <p className="muted">No scores entered yet.</p>
      ) : (
        <>
          <div className="stat-box" style={{ marginBottom: 12 }}>
            <div className="n">{data.complete ? data.total : '—'}</div>
            <div className="l">
              Team total {data.complete ? '' : '(need more players)'}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Player</th><th className="num">Total</th><th className="num">To par</th></tr>
            </thead>
            <tbody>
              {[...list].sort((a, b) => a.total - b.total).map((p) => (
                <tr key={p.player_id} className={droppedIds.has(p.player_id) ? 'dropped' : ''}>
                  <td>{p.full_name}</td>
                  <td className="num">{p.total}</td>
                  <td className="num">{formatToPar(p.tp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 8 }}>
            Struck-through players were dropped from the team total.
          </p>
        </>
      )}
    </div>
  );
}

function Roster() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('boys');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await supabase
      .from('players')
      .select('id, full_name, gender, grade, user_id, join_code')
      .order('gender').order('full_name');
    setPlayers(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function addPlayer() {
    setError('');
    if (!name.trim()) return;
    const { error } = await supabase.from('players').insert({
      full_name: name.trim(),
      gender,
      grade: grade ? Number(grade) : null,
    });
    if (error) { setError(error.message); return; }
    setName(''); setGrade(''); load();
  }

  const boys = players.filter((p) => p.gender === 'boys');
  const girls = players.filter((p) => p.gender === 'girls');

  return (
    <>
      <div className="card">
        <h2>Add player</h2>
        {error && <div className="error">{error}</div>}
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Team</label>
        <select value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="boys">Boys</option>
          <option value="girls">Girls</option>
        </select>
        <label>Grade (optional)</label>
        <input type="number" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <div className="spacer" />
        <button onClick={addPlayer}>Add to roster</button>
      </div>

      <RosterList title="Boys" players={boys} />
      <RosterList title="Girls" players={girls} />
    </>
  );
}

function RosterList({ title, players }) {
  return (
    <div className="card">
      <h2>{title} ({players.length})</h2>
      {players.length === 0 ? (
        <p className="muted">No players yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Code</th><th>Linked?</th></tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td style={{ fontFamily: 'monospace', letterSpacing: '1px', fontWeight: 700 }}>
                  {p.user_id ? '—' : (p.join_code ?? '—')}
                </td>
                <td>{p.user_id ? 'Yes' : 'Not yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Courses() {
  const [courses, setCourses] = useState([]);
  const [name, setName] = useState('');
  const [holes, setHoles] = useState(18);
  const [parText, setParText] = useState('4,4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await supabase
      .from('courses').select('id, name, holes, par_per_hole').order('name');
    setCourses(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function addCourse() {
    setError('');
    const par = parText.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
    if (par.length !== Number(holes)) {
      setError(`You entered ${par.length} par values but the course has ${holes} holes.`);
      return;
    }
    const { error } = await supabase.from('courses').insert({
      name: name.trim(), holes: Number(holes), par_per_hole: par,
    });
    if (error) { setError(error.message); return; }
    setName(''); load();
  }

  return (
    <>
      <div className="card">
        <h2>Add course</h2>
        {error && <div className="error">{error}</div>}
        <label>Course name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Holes</label>
        <select value={holes} onChange={(e) => setHoles(e.target.value)}>
          <option value={18}>18</option>
          <option value={9}>9</option>
        </select>
        <label>Par for each hole (comma-separated)</label>
        <input value={parText} onChange={(e) => setParText(e.target.value)} />
        <div className="spacer" />
        <button onClick={addCourse}>Add course</button>
      </div>

      <div className="card">
        <h2>Courses</h2>
        {courses.length === 0 ? (
          <p className="muted">No courses yet.</p>
        ) : courses.map((c) => (
          <div key={c.id} style={{ paddingBottom: 8 }}>
            <strong>{c.name}</strong>
            <div className="muted">
              {c.holes} holes · par {c.par_per_hole.reduce((a, b) => a + b, 0)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Seasons() {
  const [seasons, setSeasons] = useState([]);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, starts_on, ends_on, is_active')
      .order('starts_on', { ascending: false });
    setSeasons(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function addSeason() {
    setError('');
    if (!name.trim() || !startsOn || !endsOn) {
      setError('Please fill in a name, start date, and end date.');
      return;
    }
    if (endsOn <= startsOn) {
      setError('The end date must be after the start date.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('seasons').insert({
      name: name.trim(),
      starts_on: startsOn,
      ends_on: endsOn,
      is_active: false,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setName(''); setStartsOn(''); setEndsOn('');
    load();
  }

  // make one season active and all others inactive
  async function makeActive(id) {
    setError('');
    // turn everything off, then turn the chosen one on
    const { error: e1 } = await supabase
      .from('seasons')
      .update({ is_active: false })
      .neq('id', id);
    const { error: e2 } = await supabase
      .from('seasons')
      .update({ is_active: true })
      .eq('id', id);
    if (e1 || e2) { setError((e1 || e2).message); return; }
    load();
  }

  return (
    <>
      <div className="card">
        <h2>New season</h2>
        {error && <div className="error">{error}</div>}
        <p className="muted" style={{ marginBottom: 4 }}>
          A season is one team-year. Example: "2027 Season",
          May 2027 through May 2028.
        </p>
        <label>Season name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 2027 Season"
        />
        <label>Start date</label>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        <label>End date</label>
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        <div className="spacer" />
        <button onClick={addSeason} disabled={busy}>
          {busy ? 'Adding…' : 'Add season'}
        </button>
      </div>

      <div className="card">
        <h2>Seasons</h2>
        {seasons.length === 0 ? (
          <p className="muted">No seasons yet.</p>
        ) : (
          seasons.map((s) => (
            <div key={s.id} style={{ paddingBottom: 14, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
              <div className="row-between">
                <div>
                  <strong>{s.name}</strong>
                  {s.is_active && (
                    <span className="chip under" style={{ marginLeft: 8 }}>Active</span>
                  )}
                  <div className="muted">{s.starts_on} → {s.ends_on}</div>
                </div>
              </div>
              {!s.is_active && (
                <>
                  <div className="spacer" />
                  <button className="secondary" onClick={() => makeActive(s.id)}>
                    Make this the active season
                  </button>
                </>
              )}
            </div>
          ))
        )}
        <p className="muted">
          New rounds attach to the active season. Set a new season active
          when this year's team is formed.
        </p>
      </div>
    </>
  );
}
