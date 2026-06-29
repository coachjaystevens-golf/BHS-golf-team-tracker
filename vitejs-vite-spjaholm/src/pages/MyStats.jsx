import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import {
  roundTotal, toPar, formatToPar, tallyResults, scoringAverage,
} from '../lib/scoring.js';

export default function MyStats() {
  const { user, seasons, seasonId, setSeasonId, selectedSeason } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('players')
        .select('id, full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!p) { setData(null); setLoading(false); return; }
      if (!seasonId) { setData({ name: p.full_name, empty: true }); setLoading(false); return; }

      // pull scores joined to their round (incl. hole range) for this season
      const { data: rows, error: e } = await supabase
        .from('scores')
        .select('strokes, hole_number, putts, fairway_hit, green_in_regulation, rounds!inner ( id, type, season_id, start_hole, end_hole, played_on, courses ( par_per_hole ) )')
        .eq('player_id', p.id)
        .eq('rounds.season_id', seasonId);
      if (e) { setError(e.message); setLoading(false); return; }

      // pull this player's short-game stats (up&down, bunker) for the season
      const { data: sgRows } = await supabase
        .from('round_stats')
        .select('round_id, up_down_made, up_down_attempts, bunker_made, bunker_attempts, rounds!inner ( season_id )')
        .eq('player_id', p.id)
        .eq('rounds.season_id', seasonId);
      const sgByRound = {};
      for (const s of sgRows ?? []) sgByRound[s.round_id] = s;

      // group by round
      const byRound = {};
      for (const row of rows ?? []) {
        const rd = row.rounds;
        const rid = rd?.id;
        if (!rid) continue;
        if (!byRound[rid]) {
          byRound[rid] = {
            par: rd.courses?.par_per_hole ?? [],
            start: rd.start_hole ?? 1,
            end: rd.end_hole ?? 18,
            played_on: rd.played_on ?? null,
            shortGame: sgByRound[rid] ?? null,
            scores: [],
          };
        }
        byRound[rid].scores.push({
          hole_number: row.hole_number,
          strokes: row.strokes,
          putts: row.putts,
          fairway_hit: row.fairway_hit,
          green_in_regulation: row.green_in_regulation,
        });
      }

      // classify each round as 9-hole or 18-hole by its range
      const buckets = { full18: [], nine: [] };
      for (const r of Object.values(byRound)) {
        const holeCount = r.end - r.start + 1;
        if (holeCount <= 9) buckets.nine.push(r);
        else buckets.full18.push(r);
      }

      const summarize = (list) => {
        if (list.length === 0) return null;
        const totals = list.map((r) => roundTotal(r.scores));
        const tally = { eagle: 0, birdie: 0, par: 0, bogey: 0, double_plus: 0 };
        let best = null;

        // detail-stat accumulators
        let puttsSum = 0, puttsHoles = 0, threePutts = 0;
        let fairwayHits = 0, fairwayChances = 0;
        let girHits = 0, girHoles = 0;
        // short-game accumulators
        let udMade = 0, udAtt = 0, bnMade = 0, bnAtt = 0;

        for (const r of list) {
          const t = tallyResults(r.scores, r.par);
          for (const k in tally) tally[k] += t[k];
          const tp = toPar(r.scores, r.par);
          if (best === null || tp < best) best = tp;

          // fold in this round's short game, if recorded
          if (r.shortGame) {
            udMade += r.shortGame.up_down_made ?? 0;
            udAtt += r.shortGame.up_down_attempts ?? 0;
            bnMade += r.shortGame.bunker_made ?? 0;
            bnAtt += r.shortGame.bunker_attempts ?? 0;
          }

          for (const s of r.scores) {
            const holePar = r.par[s.hole_number - 1];
            // putts: count any hole where putts were recorded
            if (s.putts != null) {
              puttsSum += s.putts;
              puttsHoles += 1;
              if (s.putts >= 3) threePutts += 1;
            }
            // fairways: only par 4s and 5s count as a chance
            if (s.fairway_hit != null && holePar && holePar > 3) {
              fairwayChances += 1;
              if (s.fairway_hit === true) fairwayHits += 1;
            }
            // greens: every hole with a recorded value counts
            if (s.green_in_regulation != null) {
              girHoles += 1;
              if (s.green_in_regulation === true) girHits += 1;
            }
          }
        }

        const pct = (hit, total) => (total > 0 ? Math.round((hit / total) * 100) : null);
        const puttsPerRound = puttsHoles > 0
          ? Math.round((puttsSum / list.length) * 10) / 10
          : null;

        // ---- Improvement: half-vs-half average, chronological ----
        // Order rounds by date; rounds without a date sort last but still count.
        const dated = [...list].sort((a, b) => {
          const da = a.played_on ?? '9999-12-31';
          const db = b.played_on ?? '9999-12-31';
          return da < db ? -1 : da > db ? 1 : 0;
        });
        let improvement = null;
        if (dated.length >= 4) {
          const mid = Math.floor(dated.length / 2);
          const firstHalf = dated.slice(0, mid);
          const secondHalf = dated.slice(dated.length - mid); // same size as firstHalf
          const avgOf = (arr) => {
            const t = arr.map((r) => roundTotal(r.scores));
            return scoringAverage(t);
          };
          const early = avgOf(firstHalf);
          const recent = avgOf(secondHalf);
          if (early != null && recent != null) {
            const delta = Math.round((early - recent) * 10) / 10; // positive = improved
            improvement = { early, recent, delta, firstN: firstHalf.length, secondN: secondHalf.length };
          }
        }

        return {
          rounds: list.length,
          average: scoringAverage(totals),
          bestToPar: best,
          tally,
          improvement,
          detail: {
            puttsPerRound,
            puttsHoles,
            threePutts,
            fairwayPct: pct(fairwayHits, fairwayChances),
            fairwayHits, fairwayChances,
            girPct: pct(girHits, girHoles),
            girHits, girHoles,
          },
          shortGame: {
            udPct: pct(udMade, udAtt),
            udMade, udAtt,
            sandPct: pct(bnMade, bnAtt),
            bnMade, bnAtt,
          },
        };
      };

      setData({
        name: p.full_name,
        full18: summarize(buckets.full18),
        nine: summarize(buckets.nine),
        empty: Object.keys(byRound).length === 0,
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

  const StatBlock = ({ label, s }) => (
    <div className="card">
      <p className="eyebrow">{selectedSeason?.name ?? 'Season'} · {label}</p>
      {!s ? (
        <p className="muted">No {label.toLowerCase()} recorded yet.</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-box">
              <div className="n">{s.average ?? '—'}</div>
              <div className="l">Scoring average</div>
            </div>
            <div className="stat-box">
              <div className="n">{s.rounds}</div>
              <div className="l">Rounds played</div>
            </div>
            <div className="stat-box">
              <div className="n">{s.bestToPar === null ? '—' : formatToPar(s.bestToPar)}</div>
              <div className="l">Best round (to par)</div>
            </div>
            <div className="stat-box">
              <div className="n">{s.tally.birdie + s.tally.eagle}</div>
              <div className="l">Birdies or better</div>
            </div>
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><td>Eagles or better</td><td className="num">{s.tally.eagle}</td></tr>
              <tr><td>Birdies</td><td className="num">{s.tally.birdie}</td></tr>
              <tr><td>Pars</td><td className="num">{s.tally.par}</td></tr>
              <tr><td>Bogeys</td><td className="num">{s.tally.bogey}</td></tr>
              <tr><td>Double bogey +</td><td className="num">{s.tally.double_plus}</td></tr>
            </tbody>
          </table>

          {/* Improvement trend — half vs half, gated at 4 rounds */}
          <p className="eyebrow" style={{ marginTop: 16 }}>Your trend this season</p>
          {!s.improvement ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Keep playing — your improvement trend shows up once you've got
              about four {label.toLowerCase()} in. ({s.rounds} so far.)
            </p>
          ) : (
            <div
              className="stat-box"
              style={{
                background: s.improvement.delta > 0 ? 'var(--green-100)' : 'var(--white)',
                marginBottom: 4,
              }}
            >
              {s.improvement.delta > 0 ? (
                <>
                  <div className="n" style={{ color: 'var(--green-700)' }}>
                    ▼ {s.improvement.delta}
                  </div>
                  <div className="l">
                    strokes better — averaging {s.improvement.recent} lately vs {s.improvement.early} early in the season
                  </div>
                </>
              ) : s.improvement.delta < 0 ? (
                <>
                  <div className="n">{Math.abs(s.improvement.delta)} up</div>
                  <div className="l">
                    averaging {s.improvement.recent} lately vs {s.improvement.early} earlier — keep at it, scores bounce around
                  </div>
                </>
              ) : (
                <>
                  <div className="n">Steady</div>
                  <div className="l">
                    holding around {s.improvement.recent} — consistency is its own win
                  </div>
                </>
              )}
            </div>
          )}

          {/* Putting & accuracy — only shown if any of it was recorded */}
          {(s.detail.puttsHoles > 0 || s.detail.fairwayChances > 0 || s.detail.girHoles > 0) && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>Putting &amp; accuracy</p>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="n">{s.detail.puttsPerRound ?? '—'}</div>
                  <div className="l">Putts / round</div>
                </div>
                <div className="stat-box">
                  <div className="n">{s.detail.girPct == null ? '—' : `${s.detail.girPct}%`}</div>
                  <div className="l">Greens in reg</div>
                </div>
                <div className="stat-box">
                  <div className="n">{s.detail.fairwayPct == null ? '—' : `${s.detail.fairwayPct}%`}</div>
                  <div className="l">Fairways hit</div>
                </div>
                <div className="stat-box">
                  <div className="n">{s.detail.puttsHoles > 0 ? s.detail.threePutts : '—'}</div>
                  <div className="l">3-putts</div>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Based on holes where you logged putts, fairways, and greens —
                fairway % counts par 4s and 5s only.
              </p>
            </>
          )}

          {/* Short game — only shown if up&down or bunker attempts were logged */}
          {(s.shortGame.udAtt > 0 || s.shortGame.bnAtt > 0) && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>Short game</p>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="n">{s.shortGame.udPct == null ? '—' : `${s.shortGame.udPct}%`}</div>
                  <div className="l">Up &amp; down</div>
                </div>
                <div className="stat-box">
                  <div className="n">{s.shortGame.sandPct == null ? '—' : `${s.shortGame.sandPct}%`}</div>
                  <div className="l">Sand saves</div>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Up &amp; down: {s.shortGame.udMade}/{s.shortGame.udAtt} ·
                Sand saves: {s.shortGame.bnMade}/{s.shortGame.bnAtt} this season.
                Short game is where you save the most strokes.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );

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
          <StatBlock label="18-hole rounds" s={data.full18} />
          <StatBlock label="9-hole rounds" s={data.nine} />
        </>
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
