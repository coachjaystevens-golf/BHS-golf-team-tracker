import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fetchAll } from '../lib/fetchAll.js';
import { useAuth } from '../AuthContext.jsx';
import { toPar, formatToPar, tallyResults, scoringAverage } from '../lib/scoring.js';
import { isComplete, summarize } from '../lib/compareStats.js';
import { TrendChart } from './Compare.jsx';

// Averages, best round and trend use COMPLETE cards only (every hole entered),
// so a half-entered card can't make a player look better than they are.
// Per-hole stats (putts, greens, fairways, par 3/4/5) use every hole entered.
// Team numbers come from team_stat_averages() — aggregates only, never a
// teammate's own scores — and are hidden when fewer than 3 players have rounds.

const fmt1 = (v) => (v == null ? '—' : Number(v).toFixed(1));
const fmtPct = (v) => (v == null ? '—' : `${Math.round(Number(v))}%`);
const fmtVsPar = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (Math.abs(n) < 0.005) return 'E';
  return (n > 0 ? '+' : '') + n.toFixed(2);
};

export default function MyStats() {
  const { user, seasons, seasonId, setSeasonId, selectedSeason } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      const { data: p } = await supabase
        .from('players')
        .select('id, full_name, gender')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!p) { setData(null); setLoading(false); return; }
      if (!seasonId) { setData({ name: p.full_name, empty: true }); setLoading(false); return; }

      // this player's scores for the season, with each round's hole range and par
      const { data: rows, error: e } = await fetchAll(() => supabase
        .from('scores')
        .select('id, strokes, hole_number, putts, fairway_hit, green_in_regulation, rounds!inner ( id, type, season_id, start_hole, end_hole, played_on, courses ( par_per_hole ) )')
        .eq('player_id', p.id)
        .eq('rounds.season_id', seasonId));
      if (e) { setError(e.message); setLoading(false); return; }

      // short-game stats (up & down, bunker) for the season
      const { data: sgRows } = await supabase
        .from('round_stats')
        .select('round_id, up_down_made, up_down_attempts, bunker_made, bunker_attempts, rounds!inner ( season_id )')
        .eq('player_id', p.id)
        .eq('rounds.season_id', seasonId);
      const sgByRound = {};
      for (const s of sgRows ?? []) sgByRound[s.round_id] = s;

      // group by round, in the shape the shared stat math expects
      const byRound = {};
      for (const row of rows ?? []) {
        const rd = row.rounds;
        if (!rd?.id) continue;
        if (!byRound[rd.id]) {
          const start = rd.start_hole ?? 1;
          const end = rd.end_hole ?? 18;
          byRound[rd.id] = {
            id: rd.id,
            type: rd.type,
            playedOn: rd.played_on ?? null,
            holeCount: end - start + 1,
            par: rd.courses?.par_per_hole ?? [],
            sg: sgByRound[rd.id] ?? null,
            scores: [],
          };
        }
        byRound[rd.id].scores.push({
          hole_number: row.hole_number,
          strokes: row.strokes,
          putts: row.putts,
          fairway_hit: row.fairway_hit,
          green_in_regulation: row.green_in_regulation,
        });
      }
      const all = Object.values(byRound);
      const full18 = all.filter((r) => r.holeCount > 9);
      const nine = all.filter((r) => r.holeCount <= 9);

      // team averages (aggregates only); quietly skipped if unavailable
      const team = async (holes) => {
        if (!p.gender) return null;
        const { data: t, error: te } = await supabase.rpc('team_stat_averages', {
          p_season: seasonId, p_gender: p.gender, p_holes: holes,
        });
        if (te || !t?.[0] || t[0].avg_score == null && t[0].putts_per_round == null) return null;
        return t[0];
      };
      const [team18, team9] = await Promise.all([
        full18.length ? team(18) : null,
        nine.length ? team(9) : null,
      ]);

      setData({
        name: p.full_name,
        full18: buildBlock(full18, 18, team18),
        nine: buildBlock(nine, 9, team9),
        empty: all.length === 0,
      });
      setLoading(false);
    })();
  }, [user.id, seasonId]);

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
    </div>
  );

  if (loading) return <div className="content">{seasonSwitcher}<p className="muted">Loading your stats…</p></div>;
  if (error) return <div className="content">{seasonSwitcher}<div className="error">{error}</div></div>;

  if (!data) {
    return (
      <div className="content">
        {seasonSwitcher}
        <div className="card">
          <h2>My Stats</h2>
          <p className="muted">
            You aren't linked to the roster yet. Once your coach adds you,
            your season stats will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      {seasonSwitcher}
      <div className="card">
        <h2>{data.name}</h2>
        {data.empty
          ? <p className="muted">No rounds recorded in this season yet.</p>
          : <p className="muted">Your 9-hole and 18-hole rounds are shown separately, since their scores aren't directly comparable.</p>}
      </div>

      <MyGoals userId={user.id} />

      {!data.empty && (
        <>
          <StatBlock label="18-hole rounds" s={data.full18} seasonName={selectedSeason?.name} />
          <StatBlock label="9-hole rounds" s={data.nine} seasonName={selectedSeason?.name} />
        </>
      )}
    </div>
  );
}

// Everything one stat card needs, from a list of rounds
function buildBlock(rounds, holes, team) {
  if (rounds.length === 0) return null;
  const s = summarize(rounds, holes);

  const tally = { eagle: 0, birdie: 0, par: 0, bogey: 0, double_plus: 0 };
  for (const r of rounds) {
    const t = tallyResults(r.scores, r.par);
    for (const k in tally) tally[k] += t[k];
  }

  // complete cards, oldest first, for the trend
  const complete = rounds
    .filter(isComplete)
    .map((r) => ({ playedOn: r.playedOn, total: r.scores.reduce((a, x) => a + x.strokes, 0), toPar: toPar(r.scores, r.par) }))
    .sort((a, b) => (a.playedOn ?? '9999').localeCompare(b.playedOn ?? '9999'));

  // half vs half (by date), to par so different courses compare fairly
  let improvement = null;
  if (complete.length >= 4) {
    const mid = Math.floor(complete.length / 2);
    const early = complete.slice(0, mid);
    const recent = complete.slice(complete.length - mid);
    const avgTp = (a) => a.reduce((x, r) => x + r.toPar, 0) / a.length;
    const e = avgTp(early), rc = avgTp(recent);
    improvement = {
      early: scoringAverage(early.map((r) => r.total)),
      recent: scoringAverage(recent.map((r) => r.total)),
      delta: Math.round((e - rc) * 10) / 10, // positive = improved (fewer strokes over par)
    };
  }

  return {
    ...s,
    tally,
    unfinished: s.rounds - s.complete,
    improvement,
    trendPoints: complete.filter((r) => r.playedOn).map((r) => ({ t: Date.parse(r.playedOn), v: r.toPar })),
    team,
  };
}

// Big number with the team average under it, and a "better than team" hint
function Stat({ n, label, team, better, mine, theirs }) {
  let hint = null;
  if (team != null && mine != null && theirs != null && better) {
    const d = Number(mine) - Number(theirs);
    const ahead = better === 'low' ? d < -0.05 : d > 0.05;
    if (ahead) hint = <span style={{ color: 'var(--good-ink)', fontWeight: 700 }}> ✓</span>;
  }
  return (
    <div className="stat-box">
      <div className="n">{n}</div>
      <div className="l">{label}</div>
      {team != null && (
        <div className="l" style={{ marginTop: 4 }}>Team {team}{hint}</div>
      )}
    </div>
  );
}

function StatBlock({ label, s, seasonName }) {
  if (!s) {
    return (
      <div className="card">
        <p className="eyebrow">{seasonName ?? 'Season'} · {label}</p>
        <p className="muted">No {label.toLowerCase()} recorded yet.</p>
      </div>
    );
  }
  const t = s.team;
  const T = (v, f) => (t ? f(v) : null);

  return (
    <div className="card">
      <p className="eyebrow">{seasonName ?? 'Season'} · {label}</p>

      <div className="stat-grid">
        <Stat n={s.avg ?? '—'} label="Scoring average" team={T(t?.avg_score, fmt1)} better="low" mine={s.avg} theirs={t?.avg_score} />
        <Stat n={s.complete} label={s.complete === 1 ? 'Full round' : 'Full rounds'} />
        <Stat n={s.best == null ? '—' : formatToPar(s.best)} label="Best round (to par)" />
        <Stat n={s.tally.birdie + s.tally.eagle} label="Birdies or better" />
      </div>

      {s.unfinished > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {s.unfinished} {s.unfinished === 1 ? 'card is' : 'cards are'} missing holes, so{' '}
          {s.unfinished === 1 ? "it's" : "they're"} left out of your average. Finish entering{' '}
          {s.unfinished === 1 ? 'it' : 'them'} (or ask your coach) to count {s.unfinished === 1 ? 'it' : 'them'}.
        </p>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          <tr><td>Eagles or better</td><td className="num">{s.tally.eagle}</td></tr>
          <tr><td>Birdies</td><td className="num">{s.tally.birdie}</td></tr>
          <tr><td>Pars</td><td className="num">{s.tally.par}</td></tr>
          <tr><td>Bogeys</td><td className="num">{s.tally.bogey}</td></tr>
          <tr><td>Double bogey +</td><td className="num">{s.tally.double_plus}</td></tr>
        </tbody>
      </table>

      {/* Trend */}
      <p className="eyebrow" style={{ marginTop: 16 }}>Your trend this season</p>
      {!s.improvement ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Keep playing. Your improvement trend shows up once you've finished about
          four {label.toLowerCase()}. ({s.complete} so far.)
        </p>
      ) : (
        <div
          className="stat-box"
          style={{ background: s.improvement.delta > 0 ? 'var(--green-100)' : 'var(--white)', marginBottom: 8 }}
        >
          {s.improvement.delta > 0 ? (
            <>
              <div className="n" style={{ color: 'var(--green-700)' }}>▼ {s.improvement.delta}</div>
              <div className="l">
                strokes better vs par lately. Averaging {s.improvement.recent} recently vs {s.improvement.early} early in the season.
              </div>
            </>
          ) : s.improvement.delta < 0 ? (
            <>
              <div className="n">{Math.abs(s.improvement.delta)} up</div>
              <div className="l">
                vs par lately ({s.improvement.recent} recently vs {s.improvement.early} earlier). Keep at it, scores bounce around.
              </div>
            </>
          ) : (
            <>
              <div className="n">Steady</div>
              <div className="l">holding around {s.improvement.recent}. Consistency is its own win.</div>
            </>
          )}
        </div>
      )}
      {s.trendPoints.length >= 2 && (
        <>
          <TrendChart series={[{ name: 'You', color: 'var(--green-700)', points: s.trendPoints }]} />
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Score to par for each full round. Lower is better.
          </p>
        </>
      )}

      {/* Where strokes go */}
      {(s.par3 != null || s.par4 != null || s.par5 != null) && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>Where your strokes go</p>
          <table>
            <thead>
              <tr>
                <th />
                <th className="num">You</th>
                {t && <th className="num">Team</th>}
              </tr>
            </thead>
            <tbody>
              {[['Par 3s', s.par3, t?.par3], ['Par 4s', s.par4, t?.par4], ['Par 5s', s.par5, t?.par5]].map(([lbl, me, tm]) => (
                <tr key={lbl}>
                  <td>{lbl}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtVsPar(me)}</td>
                  {t && <td className="num muted">{fmtVsPar(tm)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Average score vs par on each type of hole. Your biggest number is where practice pays off most.
          </p>
        </>
      )}

      {/* Putting & accuracy */}
      {(s.putts != null || s.gir != null || s.fir != null) && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>Putting &amp; accuracy</p>
          <div className="stat-grid">
            <Stat n={fmt1(s.putts)} label="Putts / round" team={T(t?.putts_per_round, fmt1)} better="low" mine={s.putts} theirs={t?.putts_per_round} />
            <Stat n={fmtPct(s.gir)} label="Greens in reg" team={T(t?.gir_pct, fmtPct)} better="high" mine={s.gir} theirs={t?.gir_pct} />
            <Stat n={fmtPct(s.fir)} label="Fairways hit" team={T(t?.fir_pct, fmtPct)} better="high" mine={s.fir} theirs={t?.fir_pct} />
            <Stat n={fmt1(s.threePutts)} label="3-putts / round" team={T(t?.three_putts_per_round, fmt1)} better="low" mine={s.threePutts} theirs={t?.three_putts_per_round} />
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Worked out from the holes where you logged putts, fairways and greens, so
            skipped holes don't count against you. Fairway % counts par 4s and 5s only.
          </p>
        </>
      )}

      {/* Short game */}
      {(s.ud != null || s.sand != null) && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>Short game</p>
          <div className="stat-grid">
            <Stat n={fmtPct(s.ud)} label={'Up & down'} team={T(t?.ud_pct, fmtPct)} better="high" mine={s.ud} theirs={t?.ud_pct} />
            <Stat n={fmtPct(s.sand)} label="Sand saves" team={T(t?.sand_pct, fmtPct)} better="high" mine={s.sand} theirs={t?.sand_pct} />
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Short game is where you save the most strokes.
          </p>
        </>
      )}

      {t && (
        <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          "Team" is the average across your team's {label.toLowerCase()} this season. ✓ means you're ahead of it.
        </p>
      )}
    </div>
  );
}

// ---- MyGoals: a player's own practice goals (set + check off) ----
function MyGoals({ userId }) {
  const [playerId, setPlayerId] = useState(null);
  const [goals, setGoals] = useState([]);
  const [desc, setDesc] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data: p } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!p) { setPlayerId(null); return; }
    setPlayerId(p.id);
    const { data: g } = await supabase
      .from('practice_goals')
      .select('id, description, target_value, created_by, completed, created_at')
      .eq('player_id', p.id)
      .order('completed')
      .order('created_at', { ascending: false });
    setGoals(g ?? []);
  }
  useEffect(() => { load(); }, [userId]);

  async function addGoal() {
    setError('');
    if (!desc.trim() || !playerId) return;
    setAdding(true);
    const { error } = await supabase.from('practice_goals').insert({
      player_id: playerId,
      description: desc.trim(),
      target_value: target.trim() === '' ? null : Number(target),
      created_by: 'player',
      completed: false,
    });
    setAdding(false);
    if (error) { setError(error.message); return; }
    setDesc(''); setTarget('');
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

  if (!playerId) return null;

  const active = goals.filter((g) => !g.completed);
  const done = goals.filter((g) => g.completed);

  return (
    <div className="card">
      <h2>My practice goals</h2>
      <p className="muted" style={{ marginBottom: 8 }}>
        Set something to work on — a number to hit or just a focus. Check it
        off when you get there. Your coach can see these too.
      </p>
      {error && <div className="error">{error}</div>}

      <label>New goal</label>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="e.g. Cut down 3-putts, or break 80"
      />
      <label>Target number (optional)</label>
      <input
        type="number"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="e.g. 80"
      />
      <div className="spacer" />
      <button onClick={addGoal} disabled={!desc.trim() || adding}>
        {adding ? 'Adding…' : 'Add goal'}
      </button>

      {active.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>Working on</p>
          {active.map((g) => (
            <div key={g.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                {g.description}
                {g.target_value != null && <span className="muted"> · target {g.target_value}</span>}
                {g.created_by === 'coach' && <span className="chip even" style={{ marginLeft: 6 }}>from coach</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 10px' }}
                  onClick={() => toggleComplete(g)}
                >Done</button>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 8px', color: 'var(--flag)', borderColor: 'var(--flag)' }}
                  onClick={() => removeGoal(g)}
                >✕</button>
              </div>
            </div>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 16 }}>Achieved 🎉</p>
          {done.map((g) => (
            <div key={g.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: 0.7 }}>
              <div style={{ textDecoration: 'line-through' }}>
                {g.description}
                {g.target_value != null && <span className="muted"> · target {g.target_value}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 10px' }}
                  onClick={() => toggleComplete(g)}
                >Undo</button>
                <button
                  className="secondary"
                  style={{ width: 'auto', minHeight: 34, fontSize: 12, padding: '0 8px', color: 'var(--flag)', borderColor: 'var(--flag)' }}
                  onClick={() => removeGoal(g)}
                >✕</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
