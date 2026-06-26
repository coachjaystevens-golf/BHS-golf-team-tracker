import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { roundTotal, teamScore, formatToPar, toPar, scoringAverage } from '../lib/scoring.js';
import { useAuth } from '../AuthContext.jsx';

export default function CoachDashboard() {
  const [tab, setTab] = useState('team');

  const tabStyle = { fontSize: 13, padding: '0 6px' };

  return (
    <div className="content">
      <div className="card">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button className={tab === 'team' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('team')}>Scores</button>
          <button className={tab === 'board' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('board')}>Board</button>
          <button className={tab === 'goals' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('goals')}>Goals</button>
          <button className={tab === 'roster' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('roster')}>Roster</button>
          <button className={tab === 'courses' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('courses')}>Courses</button>
          <button className={tab === 'seasons' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('seasons')}>Seasons</button>
          <button className={tab === 'analysis' ? '' : 'secondary'} style={{ ...tabStyle, flex: '1 1 30%' }} onClick={() => setTab('analysis')}>Analysis</button>
        </div>
      </div>

      {tab === 'team' && <TeamScores />}
      {tab === 'board' && <Leaderboard />}
      {tab === 'goals' && <CoachGoals />}
      {tab === 'roster' && <Roster />}
      {tab === 'courses' && <Courses />}
      {tab === 'seasons' && <Seasons />}
      {tab === 'analysis' && <Analysis />}
    </div>
  );
}

function TeamScores() {
  const { seasons, seasonId, setSeasonId } = useAuth();
  const [rounds, setRounds] = useState([]);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!seasonId) { setRounds([]); setSelected(''); return; }
      const { data } = await supabase
        .from('rounds')
        .select('id, played_on, type, courses ( name )')
        .eq('season_id', seasonId)
        .order('played_on', { ascending: false });
      setRounds(data ?? []);
      setSelected(data?.length ? data[0].id : '');
      setResult(null);
    })();
  }, [seasonId]);

  async function loadScores() {
    if (!selected) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from('scores')
      .select('strokes, hole_number, players ( id, full_name, gender ), rounds ( courses ( par_per_hole ) )')
      .eq('round_id', selected);

    const { data: commentRows } = await supabase
      .from('round_comments')
      .select('player_id, body')
      .eq('round_id', selected);
    const commentsByPlayer = {};
    for (const c of commentRows ?? []) commentsByPlayer[c.player_id] = c.body;

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
      scores: [...p.scores].sort((a, b) => a.hole_number - b.hole_number),
      total: roundTotal(p.scores),
      tp: toPar(p.scores, par),
      comment: commentsByPlayer[p.player_id] ?? null,
    }));

    const boys = all.filter((p) => p.gender === 'boys');
    const girls = all.filter((p) => p.gender === 'girls');

    setResult({
      boys: teamScore(boys, 'boys'),
      girls: teamScore(girls, 'girls'),
      boysList: boys,
      girlsList: girls,
      par,
    });
    setLoading(false);
  }

  useEffect(() => { loadScores(); }, [selected]);

  return (
    <>
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
        </div>
      )}

      <div className="card">
        <label>Round</label>
        {rounds.length === 0 ? (
          <p className="muted">No rounds in this season yet.</p>
        ) : (
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.courses?.name} · {r.played_on} · {r.type}
              </option>
            ))}
          </select>
        )}
        {rounds.length > 0 && (
          <>
            <div className="spacer" />
            <button className="secondary" onClick={loadScores}>↻ Refresh scores</button>
          </>
        )}
      </div>

      {selected && <PreRoundNote roundId={selected} />}

      {loading && <p className="muted">Calculating…</p>}

      {result && (
        <>
          <TeamCard title="Boys — top 4 of 5" data={result.boys} list={result.boysList} par={result.par} onSaved={loadScores} roundId={selected} />
          <TeamCard title="Girls — top 2 of 3" data={result.girls} list={result.girlsList} par={result.par} onSaved={loadScores} roundId={selected} />
        </>
      )}
    </>
  );
}

function PreRoundNote({ roundId }) {
  const [body, setBody] = useState('');
  const [noteId, setNoteId] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setSaved(false);
      setError('');
      const { data } = await supabase
        .from('round_notes')
        .select('id, body, acknowledged')
        .eq('round_id', roundId)
        .maybeSingle();
      if (data) {
        setNoteId(data.id);
        setBody(data.body);
        setAcknowledged(data.acknowledged);
      } else {
        setNoteId(null);
        setBody('');
        setAcknowledged(false);
      }
    })();
  }, [roundId]);

  async function saveNote() {
    setError('');
    if (!body.trim()) return;
    // upsert one note per round; flipping acknowledged back to false on edit
    const { data, error } = await supabase
      .from('round_notes')
      .upsert(
        { round_id: roundId, body: body.trim(), acknowledged: false, updated_at: new Date().toISOString() },
        { onConflict: 'round_id' }
      )
      .select()
      .single();
    if (error) { setError(error.message); return; }
    setNoteId(data.id);
    setAcknowledged(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function deleteNote() {
    if (!noteId) { setBody(''); return; }
    const { error } = await supabase.from('round_notes').delete().eq('id', noteId);
    if (error) { setError(error.message); return; }
    setNoteId(null);
    setBody('');
    setAcknowledged(false);
  }

  return (
    <div className="card">
      <h2>Pre-round note</h2>
      <p className="muted" style={{ marginBottom: 6 }}>
        Leave a note the player sees at the top of their round — a focus for
        the day, a reminder, encouragement. One note per round.
      </p>
      {error && <div className="error">{error}</div>}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        style={{
          width: '100%', borderRadius: 10, border: '1.5px solid var(--line)',
          padding: 12, fontSize: 16, fontFamily: 'var(--font-body)', color: 'var(--ink)',
        }}
        placeholder="e.g. Play the par 5s safe today — smart layups, no heroics."
      />
      {saved && <div className="success">Note saved</div>}
      {noteId && (
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {acknowledged ? '✓ Player has seen this note' : 'Not yet acknowledged by the player'}
        </p>
      )}
      <div className="spacer" />
      <button onClick={saveNote} disabled={!body.trim()}>
        {noteId ? 'Update note' : 'Save note'}
      </button>
      {noteId && (
        <>
          <div className="spacer" />
          <button
            className="secondary"
            style={{ color: 'var(--flag)', borderColor: 'var(--flag)' }}
            onClick={deleteNote}
          >
            Delete note
          </button>
        </>
      )}
    </div>
  );
}

function TeamCard({ title, data, list, par, onSaved, roundId }) {
  const droppedIds = new Set(data.dropped.map((p) => p.player_id));
  const [expandedId, setExpandedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editScores, setEditScores] = useState({}); // hole_number -> strokes
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  function openEdit(p) {
    const map = {};
    p.scores.forEach((s) => { map[s.hole_number] = s.strokes; });
    setEditScores(map);
    setEditing(true);
    setEditError('');
  }

  function adjust(hole, delta) {
    setEditScores((prev) => {
      const cur = prev[hole] ?? par[hole - 1] ?? 4;
      const next = Math.min(20, Math.max(1, cur + delta));
      return { ...prev, [hole]: next };
    });
  }

  async function saveEdits(p) {
    setSaving(true);
    setEditError('');
    // upsert each hole for this player + round
    const rows = Object.entries(editScores).map(([h, strokes]) => ({
      round_id: roundId,
      player_id: p.player_id,
      hole_number: Number(h),
      strokes,
    }));
    const { error } = await supabase
      .from('scores')
      .upsert(rows, { onConflict: 'round_id,player_id,hole_number' });
    setSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditing(false);
    if (onSaved) onSaved(); // refresh totals
  }

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
              {[...list].sort((a, b) => a.total - b.total).map((p) => {
                const isOpen = expandedId === p.player_id;
                return (
                  <tr
                    key={p.player_id}
                    className={droppedIds.has(p.player_id) ? 'dropped' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setExpandedId(isOpen ? null : p.player_id); setEditing(false); }}
                  >
                    <td>{isOpen ? '▾ ' : '▸ '}{p.full_name}</td>
                    <td className="num">{p.total}</td>
                    <td className="num">{formatToPar(p.tp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* hole-by-hole for the expanded player */}
          {expandedId && (() => {
            const p = list.find((x) => x.player_id === expandedId);
            if (!p) return null;
            return (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div className="row-between">
                  <p className="eyebrow">{p.full_name} — hole by hole</p>
                  {!editing && (
                    <button
                      className="secondary"
                      style={{ width: 'auto', minHeight: 34, fontSize: 13 }}
                      onClick={() => openEdit(p)}
                    >Edit scores</button>
                  )}
                </div>

                {editError && <div className="error">{editError}</div>}

                {!editing ? (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Hole</th>
                            {p.scores.map((s) => (
                              <th key={s.hole_number} className="num">{s.hole_number}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="muted">Par</td>
                            {p.scores.map((s) => (
                              <td key={s.hole_number} className="num muted">
                                {par[s.hole_number - 1] ?? '—'}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td>Score</td>
                            {p.scores.map((s) => {
                              const hp = par[s.hole_number - 1];
                              const diff = hp ? s.strokes - hp : null;
                              const color = diff === null ? 'inherit'
                                : diff < 0 ? 'var(--green-700)'
                                : diff > 0 ? 'var(--flag)' : 'inherit';
                              return (
                                <td key={s.hole_number} className="num" style={{ color, fontWeight: diff !== 0 ? 700 : 400 }}>
                                  {s.strokes}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Green = under par · red = over par
                    </p>
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ marginBottom: 8 }}>
                      Adjust any hole, then save. Changes update {p.full_name}'s scores.
                    </p>
                    {p.scores.map((s) => {
                      const hole = s.hole_number;
                      const hp = par[hole - 1];
                      const val = editScores[hole] ?? s.strokes;
                      const diff = hp ? val - hp : null;
                      const chipClass =
                        diff === null ? 'even' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'even';
                      return (
                        <div key={hole} className="hole-row">
                          <div>
                            <div className="hole-num">{hole}</div>
                            <div className="hole-par">Par {hp ?? '—'}</div>
                          </div>
                          <div className="stepper">
                            <button className="secondary" onClick={() => adjust(hole, -1)}>−</button>
                            <span className="val">{val}</span>
                            <button className="secondary" onClick={() => adjust(hole, +1)}>+</button>
                          </div>
                          <div className={`chip ${chipClass}`}>
                            {diff === null ? '—' : formatToPar(diff)}
                          </div>
                          <div />
                        </div>
                      );
                    })}
                    <div className="spacer" />
                    <button onClick={() => saveEdits(p)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <div className="spacer" />
                    <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
                  </>
                )}

                {!editing && p.comment && (
                  <div style={{ marginTop: 10, background: 'var(--green-100)', borderRadius: 10, padding: 12 }}>
                    <p className="eyebrow" style={{ marginBottom: 4 }}>Player note</p>
                    <p style={{ fontSize: 14 }}>{p.comment}</p>
                  </div>
                )}
              </div>
            );
          })()}

          <p className="muted" style={{ marginTop: 8 }}>
            Tap a player to see their hole-by-hole. Struck-through players were dropped from the team total.
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
      .select('id, full_name, gender, grade, user_id, join_code, capture_helper')
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
        <p className="muted" style={{ marginBottom: 4 }}>
          This is your permanent list of players. Adding someone here
          makes them available to put on any season's roster below.
        </p>
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
        <button onClick={addPlayer}>Add to player list</button>
      </div>

      <RosterList title="All players · Boys" players={boys} onChange={load} />
      <RosterList title="All players · Girls" players={girls} onChange={load} />

      <SeasonRoster allPlayers={players} />
    </>
  );
}

function RosterList({ title, players, onChange }) {
  async function toggleHelper(p) {
    await supabase
      .from('players')
      .update({ capture_helper: !p.capture_helper })
      .eq('id', p.id);
    if (onChange) onChange();
  }

  return (
    <div className="card">
      <h2>{title} ({players.length})</h2>
      {players.length === 0 ? (
        <p className="muted">No players yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Code</th><th>Linked?</th><th>Capture</th></tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td style={{ fontFamily: 'monospace', letterSpacing: '1px', fontWeight: 700 }}>
                  {p.user_id ? '—' : (p.join_code ?? '—')}
                </td>
                <td>{p.user_id ? 'Yes' : 'Not yet'}</td>
                <td>
                  <button
                    onClick={() => toggleHelper(p)}
                    style={{
                      width: 'auto', minHeight: 32, fontSize: 12, padding: '0 8px',
                      background: p.capture_helper ? 'var(--green-500)' : 'var(--white)',
                      color: p.capture_helper ? 'var(--white)' : 'var(--green-700)',
                      border: p.capture_helper ? 'none' : '1.5px solid var(--green-500)',
                    }}
                  >
                    {p.capture_helper ? 'Helper ✓' : 'Make helper'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 8 }}>
        "Capture" lets a player help record green locations on the course.
        Only flag players you trust to map accurately.
      </p>
    </div>
  );
}

// ---- Season Roster: two-list manager (on the team / available) ----
function SeasonRoster({ allPlayers }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [onTeamIds, setOnTeamIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // load the list of seasons once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('seasons')
        .select('id, name, is_active, starts_on')
        .order('starts_on', { ascending: false });
      setSeasons(data ?? []);
      // default to the active season if there is one
      const active = (data ?? []).find((s) => s.is_active);
      setSeasonId(active ? active.id : (data?.[0]?.id ?? ''));
    })();
  }, []);

  // whenever the selected season changes, load its roster
  async function loadRoster(sid) {
    if (!sid) return;
    setLoading(true);
    const { data } = await supabase
      .from('season_players')
      .select('player_id')
      .eq('season_id', sid);
    setOnTeamIds(new Set((data ?? []).map((r) => r.player_id)));
    setLoading(false);
  }
  useEffect(() => { loadRoster(seasonId); }, [seasonId]);

  async function addToTeam(playerId) {
    setError('');
    const { error } = await supabase
      .from('season_players')
      .insert({ season_id: seasonId, player_id: playerId });
    if (error) { setError(error.message); return; }
    setOnTeamIds((prev) => new Set(prev).add(playerId));
  }

  async function removeFromTeam(playerId) {
    setError('');
    const { error } = await supabase
      .from('season_players')
      .delete()
      .eq('season_id', seasonId)
      .eq('player_id', playerId);
    if (error) { setError(error.message); return; }
    setOnTeamIds((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  }

  const onTeam = allPlayers.filter((p) => onTeamIds.has(p.id));
  const available = allPlayers.filter((p) => !onTeamIds.has(p.id));
  const selectedSeason = seasons.find((s) => s.id === seasonId);

  return (
    <div className="card">
      <h2>Season roster</h2>
      <p className="muted" style={{ marginBottom: 4 }}>
        Choose a season, then set who is on the team that year. A player
        left off a season keeps all their history — they just aren't on
        that year's team.
      </p>

      <label>Season</label>
      <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.is_active ? ' (active)' : ''}
          </option>
        ))}
      </select>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {loading && <p className="muted" style={{ marginTop: 10 }}>Loading roster…</p>}

      {!loading && selectedSeason && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>
            On the {selectedSeason.name} team ({onTeam.length})
          </p>
          {onTeam.length === 0 ? (
            <p className="muted">No players on this season's team yet.</p>
          ) : (
            onTeam.map((p) => (
              <div key={p.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{p.full_name} <span className="muted">· {p.gender}</span></span>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 38, fontSize: 13, color: 'var(--flag)', borderColor: 'var(--flag)' }}
                  onClick={() => removeFromTeam(p.id)}
                >Remove</button>
              </div>
            ))
          )}

          <p className="eyebrow" style={{ marginTop: 18 }}>
            Available to add ({available.length})
          </p>
          {available.length === 0 ? (
            <p className="muted">Everyone is already on this season's team.</p>
          ) : (
            available.map((p) => (
              <div key={p.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{p.full_name} <span className="muted">· {p.gender}</span></span>
                <button
                  style={{ width: 'auto', minHeight: 38, fontSize: 13 }}
                  onClick={() => addToTeam(p.id)}
                >Add</button>
              </div>
            ))
          )}
        </>
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

  // editing state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editParText, setEditParText] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  function startEdit(c) {
    setEditingId(c.id);
    setEditName(c.name ?? '');
    setEditParText(c.par_per_hole.join(','));
    setEditError('');
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(c) {
    setEditError('');
    const par = editParText.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
    if (par.length !== c.holes) {
      setEditError(`This is a ${c.holes}-hole course, so you need ${c.holes} par values. You entered ${par.length}.`);
      return;
    }
    if (!editName.trim()) {
      setEditError('Course name cannot be blank.');
      return;
    }
    const { error } = await supabase
      .from('courses')
      .update({ name: editName.trim(), par_per_hole: par })
      .eq('id', c.id);
    if (error) { setEditError(error.message); return; }
    setEditingId(null);
    load();
  }

  async function deleteCourse(c) {
    setEditError('');
    // safety: refuse if any rounds use this course
    const { count, error: ce } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', c.id);
    if (ce) { setEditError(ce.message); return; }
    if (count && count > 0) {
      setEditError(
        `Can't delete "${c.name}" — ${count} round(s) have been played on it. ` +
        `Those rounds (and their scores) would be lost. Leave this course in place to keep that history.`
      );
      return;
    }
    const { error } = await supabase.from('courses').delete().eq('id', c.id);
    if (error) { setEditError(error.message); return; }
    setEditingId(null);
    setConfirmDeleteId(null);
    load();
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
          <div key={c.id} style={{ paddingBottom: 14, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
            {editingId === c.id ? (
              <>
                {editError && <div className="error">{editError}</div>}
                <label>Course name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                <label>Par for each hole ({c.holes} values, comma-separated)</label>
                <input value={editParText} onChange={(e) => setEditParText(e.target.value)} />
                <div className="spacer" />
                <button onClick={() => saveEdit(c)}>Save changes</button>
                <div className="spacer" />
                <button className="secondary" onClick={cancelEdit}>Cancel</button>
                <div className="spacer" />
                {confirmDeleteId === c.id ? (
                  <>
                    <p className="muted" style={{ marginBottom: 8 }}>
                      Delete this course? Only works if no rounds use it.
                    </p>
                    <button style={{ background: 'var(--flag)' }} onClick={() => deleteCourse(c)}>
                      Yes, delete course
                    </button>
                    <div className="spacer" />
                    <button className="secondary" onClick={() => setConfirmDeleteId(null)}>
                      Keep course
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary"
                    style={{ color: 'var(--flag)', borderColor: 'var(--flag)' }}
                    onClick={() => setConfirmDeleteId(c.id)}
                  >
                    Delete course
                  </button>
                )}
              </>
            ) : (
              <div className="row-between">
                <div>
                  <strong>{c.name || '(no name)'}</strong>
                  <div className="muted">
                    {c.holes} holes · par {c.par_per_hole.reduce((a, b) => a + b, 0)}
                  </div>
                </div>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 38, fontSize: 13 }}
                  onClick={() => startEdit(c)}
                >Edit</button>
              </div>
            )}
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

  async function makeActive(id) {
    setError('');
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

// ---- Analysis: coach-only data insights for the selected season ----
function Analysis() {
  const { seasons, seasonId, setSeasonId, selectedSeason } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    if (!seasonId) { setData(null); return; }
    setLoading(true);
    setError('');

    // every score in this season, with player, course, and round info
    const { data: rows, error: e } = await supabase
      .from('scores')
      .select('strokes, hole_number, putts, fairway_hit, green_in_regulation, players ( id, full_name, gender ), rounds!inner ( id, season_id, courses ( name, par_per_hole ) )')
      .eq('rounds.season_id', seasonId);
    if (e) { setError(e.message); setLoading(false); return; }

    // build per-player aggregates
    const players = {}; // id -> { name, gender, parType:{3:{n,sum},4,5}, courses:{name:{strokes,holes,rounds:Set}}, blowups, holes, rounds:Set }

    for (const r of rows ?? []) {
      const pid = r.players?.id;
      if (!pid) continue;
      const par = r.rounds?.courses?.par_per_hole ?? [];
      const hp = par[r.hole_number - 1];
      if (hp == null) continue;
      const courseName = r.rounds?.courses?.name || '(unnamed)';
      const roundId = r.rounds?.id;
      const diff = r.strokes - hp;

      if (!players[pid]) {
        players[pid] = {
          name: r.players.full_name,
          gender: r.players.gender,
          parType: { 3: { n: 0, sum: 0 }, 4: { n: 0, sum: 0 }, 5: { n: 0, sum: 0 } },
          courses: {},
          blowups: 0,
          holes: 0,
          rounds: new Set(),
          puttsSum: 0, puttsHoles: 0,
          fairwayHit: 0, fairwayTotal: 0,
          girHit: 0, girTotal: 0,
        };
      }
      const P = players[pid];
      P.holes += 1;
      P.rounds.add(roundId);
      if (diff >= 2) P.blowups += 1;
      if (P.parType[hp]) { P.parType[hp].n += 1; P.parType[hp].sum += diff; }
      if (!P.courses[courseName]) P.courses[courseName] = { sum: 0, holes: 0, rounds: new Set() };
      P.courses[courseName].sum += diff;
      P.courses[courseName].holes += 1;
      P.courses[courseName].rounds.add(roundId);

      // detail stats (only count holes where they were recorded)
      if (r.putts != null) { P.puttsSum += r.putts; P.puttsHoles += 1; }
      // fairways only apply to par 4s and 5s
      if (r.fairway_hit != null && hp >= 4) {
        P.fairwayTotal += 1;
        if (r.fairway_hit) P.fairwayHit += 1;
      }
      if (r.green_in_regulation != null) {
        P.girTotal += 1;
        if (r.green_in_regulation) P.girHit += 1;
      }
    }

    // team-wide par-type
    const team = { 3: { n: 0, sum: 0 }, 4: { n: 0, sum: 0 }, 5: { n: 0, sum: 0 } };
    for (const P of Object.values(players)) {
      for (const k of [3, 4, 5]) { team[k].n += P.parType[k].n; team[k].sum += P.parType[k].sum; }
    }

    setData({ players, team });
    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]);

  const avg = (sum, n) => (n === 0 ? null : Math.round((sum / n) * 100) / 100);
  const fmtAvg = (v) => (v === null ? '—' : (v > 0 ? `+${v}` : `${v}`));

  const seasonSwitcher = seasons.length > 0 && (
    <div className="card">
      <label>Season</label>
      <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.is_active ? ' (current)' : ''}
          </option>
        ))}
      </select>
      <div className="spacer" />
      <button className="secondary" onClick={load}>↻ Refresh</button>
    </div>
  );

  if (loading) return <>{seasonSwitcher}<p className="muted">Crunching the numbers…</p></>;
  if (error) return <>{seasonSwitcher}<div className="error">{error}</div></>;

  if (!data || Object.keys(data.players).length === 0) {
    return (
      <>
        {seasonSwitcher}
        <div className="card">
          <h2>Analysis</h2>
          <p className="muted">No scores in {selectedSeason?.name ?? 'this season'} yet. Once rounds are recorded, insights show up here.</p>
        </div>
      </>
    );
  }

  const playerList = Object.values(data.players).sort((a, b) => a.name.localeCompare(b.name));
  const totalRounds = new Set();
  playerList.forEach((p) => p.rounds.forEach((r) => totalRounds.add(r)));
  const thin = totalRounds.size < 4;

  return (
    <>
      {seasonSwitcher}

      {thin && (
        <div className="card" style={{ background: 'var(--green-100)' }}>
          <p className="muted" style={{ margin: 0 }}>
            Heads up: only {totalRounds.size} round(s) of data so far, so these
            numbers are an early snapshot, not a reliable trend. They get more
            meaningful as more rounds are played.
          </p>
        </div>
      )}

      {/* Team-wide par type */}
      <div className="card">
        <h2>Team — by hole type</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Average strokes over/under par per hole, all players combined.</p>
        <table>
          <thead><tr><th>Hole type</th><th className="num">Avg vs par</th><th className="num">Holes</th></tr></thead>
          <tbody>
            {[3, 4, 5].map((k) => (
              <tr key={k}>
                <td>Par {k}</td>
                <td className="num">{fmtAvg(avg(data.team[k].sum, data.team[k].n))}</td>
                <td className="num">{data.team[k].n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-player par type */}
      <div className="card">
        <h2>Players — by hole type</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Each player's average vs par on par 3s / 4s / 5s.</p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Player</th><th className="num">Par 3</th><th className="num">Par 4</th><th className="num">Par 5</th></tr>
            </thead>
            <tbody>
              {playerList.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="num">{fmtAvg(avg(p.parType[3].sum, p.parType[3].n))}</td>
                  <td className="num">{fmtAvg(avg(p.parType[4].sum, p.parType[4].n))}</td>
                  <td className="num">{fmtAvg(avg(p.parType[5].sum, p.parType[5].n))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blow-up holes */}
      <div className="card">
        <h2>Blow-up holes</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Holes scored double bogey or worse — limiting these is often the fastest way to lower a score.</p>
        <table>
          <thead><tr><th>Player</th><th className="num">Blow-ups</th><th className="num">Per round</th></tr></thead>
          <tbody>
            {[...playerList].sort((a, b) => b.blowups - a.blowups).map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="num">{p.blowups}</td>
                <td className="num">{p.rounds.size ? Math.round((p.blowups / p.rounds.size) * 10) / 10 : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Putting & accuracy */}
      <div className="card">
        <h2>Putting & accuracy</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Putts per round, fairways hit (par 4s &amp; 5s), and greens in regulation —
          only counts holes where these were recorded.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Putts/rd</th>
                <th className="num">Fairways</th>
                <th className="num">GIR</th>
              </tr>
            </thead>
            <tbody>
              {playerList.map((p) => {
                const puttsPerRound = p.rounds.size && p.puttsHoles
                  ? Math.round((p.puttsSum / p.rounds.size) * 10) / 10
                  : null;
                const fwPct = p.fairwayTotal
                  ? Math.round((p.fairwayHit / p.fairwayTotal) * 100)
                  : null;
                const girPct = p.girTotal
                  ? Math.round((p.girHit / p.girTotal) * 100)
                  : null;
                return (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{puttsPerRound ?? '—'}</td>
                    <td className="num">{fwPct === null ? '—' : `${fwPct}%`}</td>
                    <td className="num">{girPct === null ? '—' : `${girPct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Putts/rd assumes putts were logged on every hole of a round; if some
          holes were skipped, treat it as approximate.
        </p>
      </div>

      {/* Course comparison */}
      <div className="card">
        <h2>By course</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Each player's average vs par at each course they've played.</p>
        {playerList.map((p) => {
          const courseNames = Object.keys(p.courses).sort();
          if (courseNames.length === 0) return null;
          return (
            <div key={p.name} style={{ marginBottom: 14 }}>
              <strong>{p.name}</strong>
              <table>
                <tbody>
                  {courseNames.map((cn) => {
                    const c = p.courses[cn];
                    return (
                      <tr key={cn}>
                        <td>{cn}</td>
                        <td className="num">{fmtAvg(avg(c.sum, c.holes))} <span className="muted">/hole</span></td>
                        <td className="num muted">{c.rounds.size} rd</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---- Leaderboard: season standings, ranked, boys & girls separate ----
function Leaderboard() {
  const { seasons, seasonId, setSeasonId, selectedSeason } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('average'); // average | putts | pars | best

  async function load() {
    if (!seasonId) { setRows(null); return; }
    setLoading(true);
    setError('');

    // every score this season, with player + round range + course par
    const { data: scoreRows, error: e } = await supabase
      .from('scores')
      .select('strokes, hole_number, putts, players ( id, full_name, gender ), rounds!inner ( id, season_id, start_hole, end_hole, courses ( par_per_hole ) )')
      .eq('rounds.season_id', seasonId);
    if (e) { setError(e.message); setLoading(false); return; }

    // group scores by player, then by round
    const players = {}; // pid -> { name, gender, rounds: { rid: { par, scores:[], putts:[] } } }
    for (const r of scoreRows ?? []) {
      const pid = r.players?.id;
      const rid = r.rounds?.id;
      if (!pid || !rid) continue;
      if (!players[pid]) {
        players[pid] = { name: r.players.full_name, gender: r.players.gender, rounds: {} };
      }
      if (!players[pid].rounds[rid]) {
        players[pid].rounds[rid] = {
          par: r.rounds?.courses?.par_per_hole ?? [],
          scores: [],
          puttsSum: 0, puttsHoles: 0,
        };
      }
      const R = players[pid].rounds[rid];
      R.scores.push({ hole_number: r.hole_number, strokes: r.strokes });
      if (r.putts != null) { R.puttsSum += r.putts; R.puttsHoles += 1; }
    }

    // compute per-player season aggregates
    const list = Object.values(players).map((p) => {
      const roundList = Object.values(p.rounds);
      const totals = [];
      let bestToPar = null;
      let parsOrBetter = 0;
      let puttsSum = 0, puttsRounds = 0;

      for (const R of roundList) {
        const total = roundTotal(R.scores);
        totals.push(total);
        const tp = toPar(R.scores, R.par);
        if (bestToPar === null || tp < bestToPar) bestToPar = tp;
        // pars or better: holes where strokes <= par
        for (const s of R.scores) {
          const hp = R.par[s.hole_number - 1];
          if (hp && s.strokes <= hp) parsOrBetter += 1;
        }
        // putts per round only counts rounds where putts were logged
        if (R.puttsHoles > 0) { puttsSum += R.puttsSum; puttsRounds += 1; }
      }

      return {
        name: p.name,
        gender: p.gender,
        rounds: roundList.length,
        average: scoringAverage(totals),
        bestToPar,
        parsOrBetter,
        puttsPerRound: puttsRounds > 0 ? Math.round((puttsSum / puttsRounds) * 10) / 10 : null,
      };
    });

    setRows(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]);

  const seasonSwitcher = seasons.length > 0 && (
    <div className="card">
      <label>Season</label>
      <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.is_active ? ' (current)' : ''}
          </option>
        ))}
      </select>
      <div className="spacer" />
      <button className="secondary" onClick={load}>↻ Refresh</button>
    </div>
  );

  if (loading) return <>{seasonSwitcher}<p className="muted">Building the board…</p></>;
  if (error) return <>{seasonSwitcher}<div className="error">{error}</div></>;

  if (!rows || rows.length === 0) {
    return (
      <>
        {seasonSwitcher}
        <div className="card">
          <h2>Leaderboard</h2>
          <p className="muted">No scores in {selectedSeason?.name ?? 'this season'} yet. Standings appear once rounds are recorded.</p>
        </div>
      </>
    );
  }

  // sort comparators: lower is better for average/putts/best; higher better for pars
  const sortFns = {
    average: (a, b) => (a.average ?? 999) - (b.average ?? 999),
    putts:   (a, b) => (a.puttsPerRound ?? 999) - (b.puttsPerRound ?? 999),
    pars:    (a, b) => b.parsOrBetter - a.parsOrBetter,
    best:    (a, b) => (a.bestToPar ?? 999) - (b.bestToPar ?? 999),
  };

  const Header = ({ label, k }) => (
    <th
      className="num"
      style={{ cursor: 'pointer', textDecoration: sortKey === k ? 'underline' : 'none' }}
      onClick={() => setSortKey(k)}
    >
      {label}{sortKey === k ? ' ▾' : ''}
    </th>
  );

  const Board = ({ title, players }) => {
    if (players.length === 0) return null;
    const sorted = [...players].sort(sortFns[sortKey]);
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Tap a column to rank by it. Lower is better for average, putts, and best round.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <Header label="Avg" k="average" />
                <Header label="Putts/rd" k="putts" />
                <Header label="Pars+" k="pars" />
                <Header label="Best" k="best" />
                <th className="num">Rds</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.name}>
                  <td className="num">{i + 1}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.average ?? '—'}</td>
                  <td className="num">{p.puttsPerRound ?? '—'}</td>
                  <td className="num">{p.parsOrBetter}</td>
                  <td className="num">{p.bestToPar === null ? '—' : formatToPar(p.bestToPar)}</td>
                  <td className="num">{p.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const boys = rows.filter((p) => p.gender === 'boys');
  const girls = rows.filter((p) => p.gender === 'girls');

  return (
    <>
      {seasonSwitcher}
      <Board title="Boys" players={boys} />
      <Board title="Girls" players={girls} />
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Putts/round counts only rounds where putts were logged, so it may
          cover fewer rounds than a player's scoring average.
        </p>
      </div>
    </>
  );
}

// ---- CoachGoals: view all players' goals, add goals for any player ----
function CoachGoals() {
  const [players, setPlayers] = useState([]);
  const [goalsByPlayer, setGoalsByPlayer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // new-goal form state, keyed by player id
  const [draftFor, setDraftFor] = useState(null);
  const [desc, setDesc] = useState('');
  const [target, setTarget] = useState('');

  async function load() {
    setLoading(true);
    const { data: pl } = await supabase
      .from('players')
      .select('id, full_name, gender')
      .order('gender').order('full_name');
    setPlayers(pl ?? []);

    const { data: goals } = await supabase
      .from('practice_goals')
      .select('id, player_id, description, target_value, created_by, completed, created_at')
      .order('completed')
      .order('created_at', { ascending: false });

    const byPlayer = {};
    for (const g of goals ?? []) {
      if (!byPlayer[g.player_id]) byPlayer[g.player_id] = [];
      byPlayer[g.player_id].push(g);
    }
    setGoalsByPlayer(byPlayer);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addGoal(playerId) {
    setError('');
    if (!desc.trim()) return;
    const { error } = await supabase.from('practice_goals').insert({
      player_id: playerId,
      description: desc.trim(),
      target_value: target.trim() === '' ? null : Number(target),
      created_by: 'coach',
      completed: false,
    });
    if (error) { setError(error.message); return; }
    setDesc(''); setTarget(''); setDraftFor(null);
    load();
  }

  async function toggleComplete(g) {
    const { error } = await supabase
      .from('practice_goals')
      .update({ completed: !g.completed, updated_at: new Date().toISOString() })
      .eq('id', g.id);
    if (!error) load();
  }

  async function removeGoal(g) {
    const { error } = await supabase.from('practice_goals').delete().eq('id', g.id);
    if (!error) load();
  }

  if (loading) return <p className="muted">Loading goals…</p>;

  const boys = players.filter((p) => p.gender === 'boys');
  const girls = players.filter((p) => p.gender === 'girls');

  const PlayerGoals = ({ p }) => {
    const goals = goalsByPlayer[p.id] ?? [];
    const active = goals.filter((g) => !g.completed);
    const done = goals.filter((g) => g.completed);
    const isDrafting = draftFor === p.id;
    return (
      <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <div className="row-between">
          <strong>{p.full_name}</strong>
          {!isDrafting && (
            <button
              className="secondary"
              style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 10px' }}
              onClick={() => { setDraftFor(p.id); setDesc(''); setTarget(''); }}
            >+ Goal</button>
          )}
        </div>

        {isDrafting && (
          <div style={{ marginTop: 8 }}>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Work on bunker play"
            />
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target number (optional)"
            />
            <div className="spacer" />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ width: 'auto', padding: '0 12px' }} onClick={() => addGoal(p.id)} disabled={!desc.trim()}>Save</button>
              <button className="secondary" style={{ width: 'auto', padding: '0 12px' }} onClick={() => setDraftFor(null)}>Cancel</button>
            </div>
          </div>
        )}

        {goals.length === 0 && !isDrafting && (
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>No goals yet.</p>
        )}

        {active.map((g) => (
          <div key={g.id} className="row-between" style={{ padding: '6px 0' }}>
            <div style={{ fontSize: 14 }}>
              {g.description}
              {g.target_value != null && <span className="muted"> · target {g.target_value}</span>}
              {g.created_by === 'player' && <span className="chip even" style={{ marginLeft: 6 }}>player set</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ width: 'auto', minHeight: 32, fontSize: 12, padding: '0 8px' }} onClick={() => toggleComplete(g)}>Done</button>
              <button className="secondary" style={{ width: 'auto', minHeight: 32, fontSize: 12, padding: '0 8px', color: 'var(--flag)', borderColor: 'var(--flag)' }} onClick={() => removeGoal(g)}>✕</button>
            </div>
          </div>
        ))}

        {done.map((g) => (
          <div key={g.id} className="row-between" style={{ padding: '6px 0', opacity: 0.6 }}>
            <div style={{ fontSize: 14, textDecoration: 'line-through' }}>
              {g.description}
              {g.target_value != null && <span className="muted"> · target {g.target_value}</span>}
            </div>
            <button className="secondary" style={{ width: 'auto', minHeight: 32, fontSize: 12, padding: '0 8px' }} onClick={() => toggleComplete(g)}>Undo</button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>Boys — goals</h2>
        {boys.length === 0 ? <p className="muted">No boys on the roster.</p>
          : boys.map((p) => <PlayerGoals key={p.id} p={p} />)}
      </div>
      <div className="card">
        <h2>Girls — goals</h2>
        {girls.length === 0 ? <p className="muted">No girls on the roster.</p>
          : girls.map((p) => <PlayerGoals key={p.id} p={p} />)}
      </div>
    </>
  );
}
