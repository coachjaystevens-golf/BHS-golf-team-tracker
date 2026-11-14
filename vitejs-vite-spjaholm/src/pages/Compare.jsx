// ---- Compare: side-by-side player comparisons and season-over-season team view ----
//
// Players mode: pick 2–4 players, see their stats side by side (best value in
// each row highlighted), a to-par trend chart, and — for exactly two players —
// their head-to-head record in rounds they both finished.
//
// Seasons mode: the boys' and girls' teams in one season against another.
//
// Scoring average / to-par / best round use only COMPLETE cards (every hole of
// the round entered), so a half-entered card can't drag an average down.
// Per-hole stats (putts, greens, fairways, birdies…) use every hole entered.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fetchAll } from '../lib/fetchAll.js';
import { roundTotal, toPar, formatToPar, COUNTING_SCORES } from '../lib/scoring.js';
import { inFilter, isComplete, summarize, teamStats } from '../lib/compareStats.js';
import { useAuth } from '../AuthContext.jsx';

const MAX_PLAYERS = 4;
// Line/marker colors for up to 4 players — none of them red, so they never
// read as the app's "bad result" color.
const SERIES_COLORS = ['#2563eb', '#e07b12', '#0d9488', '#7c3aed'];

// ---------- data loading ----------

async function loadSeason(seasonId) {
  const [scoresRes, sgRes] = await Promise.all([
    fetchAll(() => supabase
      .from('scores')
      .select('id, strokes, hole_number, putts, fairway_hit, green_in_regulation, players ( id, full_name, gender, archived ), rounds!inner ( id, type, season_id, start_hole, end_hole, played_on, courses ( par_per_hole ) )')
      .eq('rounds.season_id', seasonId)),
    fetchAll(() => supabase
      .from('round_stats')
      .select('id, round_id, player_id, up_down_made, up_down_attempts, bunker_made, bunker_attempts, rounds!inner ( season_id )')
      .eq('rounds.season_id', seasonId)),
  ]);
  if (scoresRes.error) throw new Error(scoresRes.error.message);
  if (sgRes.error) throw new Error(sgRes.error.message);

  const sg = {};
  for (const s of sgRes.data) sg[`${s.player_id}:${s.round_id}`] = s;

  const players = {};
  for (const row of scoresRes.data) {
    const p = row.players;
    const r = row.rounds;
    if (!p?.id || !r?.id) continue;
    if (!players[p.id]) {
      players[p.id] = { id: p.id, name: p.full_name, gender: p.gender, archived: !!p.archived, rounds: {} };
    }
    const P = players[p.id];
    if (!P.rounds[r.id]) {
      const start = r.start_hole ?? 1;
      const end = r.end_hole ?? 18;
      P.rounds[r.id] = {
        id: r.id,
        type: r.type,
        playedOn: r.played_on ?? null,
        holeCount: end - start + 1,
        par: r.courses?.par_per_hole ?? [],
        sg: sg[`${p.id}:${r.id}`] ?? null,
        scores: [],
      };
    }
    P.rounds[r.id].scores.push({
      hole_number: row.hole_number,
      strokes: row.strokes,
      putts: row.putts,
      fairway_hit: row.fairway_hit,
      green_in_regulation: row.green_in_regulation,
    });
  }
  for (const P of Object.values(players)) P.rounds = Object.values(P.rounds);
  return players;
}

// ---------- formatting ----------

const fmt1 = (v) => (v == null ? '—' : v.toFixed(1));
const fmtPct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
const fmtSigned = (d) => (v) => {
  if (v == null) return '—';
  if (Math.abs(v) < 0.5 * 10 ** -d) return 'E';
  return (v > 0 ? '+' : '') + v.toFixed(d);
};

// better: 'low' | 'high' | null (null = not ranked)
const ROWS = [
  { key: 'complete', label: 'Full rounds', better: null, fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'avg', label: 'Scoring avg', better: 'low', fmt: fmt1 },
  { key: 'avgToPar', label: 'Avg to par', better: 'low', fmt: fmtSigned(1) },
  { key: 'best', label: 'Best round', better: 'low', fmt: (v) => (v == null ? '—' : formatToPar(v)) },
  { key: 'putts', label: 'Putts / round', better: 'low', fmt: fmt1 },
  { key: 'threePutts', label: '3-putts / round', better: 'low', fmt: fmt1 },
  { key: 'gir', label: 'Greens in reg', better: 'high', fmt: fmtPct },
  { key: 'fir', label: 'Fairways hit', better: 'high', fmt: fmtPct },
  { key: 'birdies', label: 'Birdies+ / round', better: 'high', fmt: fmt1 },
  { key: 'doubles', label: 'Doubles+ / round', better: 'low', fmt: fmt1 },
  { key: 'par3', label: 'Par 3s (vs par)', better: 'low', fmt: fmtSigned(2) },
  { key: 'par4', label: 'Par 4s (vs par)', better: 'low', fmt: fmtSigned(2) },
  { key: 'par5', label: 'Par 5s (vs par)', better: 'low', fmt: fmtSigned(2) },
  { key: 'ud', label: 'Up & down', better: 'high', fmt: fmtPct },
  { key: 'sand', label: 'Sand saves', better: 'high', fmt: fmtPct },
];

// indexes of the best value(s) in a row; empty if fewer than 2 values to compare
function bestIndexes(values, better) {
  if (!better) return [];
  const present = values.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (present.length < 2) return [];
  const round2 = (v) => Math.round(v * 100) / 100;
  const target = better === 'low'
    ? Math.min(...present.map(([v]) => round2(v)))
    : Math.max(...present.map(([v]) => round2(v)));
  return present.filter(([v]) => round2(v) === target).map(([, i]) => i);
}

// ---------- small UI pieces ----------

const chipBtn = { width: 'auto', minHeight: 34, fontSize: 13, padding: '0 10px' };

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          className={value === v ? '' : 'secondary'}
          style={{ ...chipBtn, flex: 1 }}
          onClick={() => onChange(v)}
        >{label}</button>
      ))}
    </div>
  );
}

function FilterCard({ filter, setFilter }) {
  return (
    <div className="card">
      <label>Rounds</label>
      <Segmented
        value={filter.holes}
        options={[['18', '18-hole'], ['9', '9-hole']]}
        onChange={(holes) => setFilter((f) => ({ ...f, holes }))}
      />
      <div className="spacer" />
      <Segmented
        value={filter.type}
        options={[['all', 'All'], ['match', 'Matches'], ['practice', 'Practice']]}
        onChange={(type) => setFilter((f) => ({ ...f, type }))}
      />
    </div>
  );
}

// ---------- trend chart (to par per complete round, by date) ----------

function TrendChart({ series }) {
  const W = 340, H = 200, L = 34, R = 10, T = 12, B = 26;
  const pts = series.flatMap((s) => s.points);
  if (pts.length < 2) {
    return <p className="muted" style={{ fontSize: 13 }}>Not enough dated, complete rounds to draw a trend yet.</p>;
  }
  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.v);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
  let y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
  const step = Math.max(1, Math.ceil((y1 - y0) / 5));
  y0 = Math.floor(y0 / step) * step;
  y1 = Math.ceil(y1 / step) * step;
  const sx = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v) => T + ((y1 - v) / (y1 - y0)) * (H - T - B);
  const ticks = [];
  for (let v = y0; v <= y1; v += step) ticks.push(v);
  const day = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Score to par by date">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={L - 5} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
            {v === 0 ? 'E' : v > 0 ? `+${v}` : v}
          </text>
        </g>
      ))}
      <text x={L} y={H - 6} fontSize="10" fill="var(--muted)">{day(x0)}</text>
      <text x={W - R} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end">{day(x1)}</text>
      {series.map((s) => {
        const sorted = [...s.points].sort((a, b) => a.t - b.t);
        return (
          <g key={s.name}>
            {sorted.length > 1 && (
              <polyline
                points={sorted.map((p) => `${sx(p.t)},${sy(p.v)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {sorted.map((p, i) => (
              <circle key={i} cx={sx(p.t)} cy={sy(p.v)} r="3.5" fill={s.color} stroke="var(--white)" strokeWidth="1">
                <title>{`${s.name} · ${day(p.t)} · ${p.v === 0 ? 'E' : p.v > 0 ? `+${p.v}` : p.v}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- main component ----------

export default function Compare() {
  const [mode, setMode] = useState('players');
  const [filter, setFilter] = useState({ holes: '18', type: 'all' });
  const cache = useRef({}); // seasonId -> players map

  async function getSeason(id) {
    if (!cache.current[id]) cache.current[id] = loadSeason(id);
    try {
      return await cache.current[id];
    } catch (e) {
      delete cache.current[id]; // let a retry fetch again
      throw e;
    }
  }

  return (
    <>
      <div className="card">
        <h2>Compare</h2>
        <Segmented
          value={mode}
          options={[['players', 'Players'], ['seasons', 'Season vs season']]}
          onChange={setMode}
        />
      </div>
      <FilterCard filter={filter} setFilter={setFilter} />
      {mode === 'players'
        ? <ComparePlayers filter={filter} getSeason={getSeason} />
        : <CompareSeasons filter={filter} getSeason={getSeason} />}
    </>
  );
}

// ---------- Players mode ----------

function ComparePlayers({ filter, getSeason }) {
  const { seasons, seasonId, setSeasonId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!seasonId) { setData(null); return; }
    let live = true;
    setLoading(true); setError('');
    getSeason(seasonId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [seasonId]);

  const N = filter.holes === '9' ? 9 : 18;

  // players who have at least one round under the current filter
  const eligible = useMemo(() => {
    if (!data) return [];
    return Object.values(data)
      .map((p) => ({ ...p, filtered: p.rounds.filter((r) => inFilter(r, filter)) }))
      .filter((p) => p.filtered.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, filter]);

  // drop selections that no longer have rounds under the filter / season
  useEffect(() => {
    setSelected((sel) => sel.filter((id) => eligible.some((p) => p.id === id)));
  }, [eligible]);

  function toggle(id) {
    setSelected((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id);
      if (sel.length >= MAX_PLAYERS) return sel;
      return [...sel, id];
    });
  }

  const chosen = selected.map((id, i) => {
    const p = eligible.find((x) => x.id === id);
    return { ...p, color: SERIES_COLORS[i], stats: summarize(p.filtered, N) };
  });

  const seasonPicker = seasons.length > 0 && (
    <div className="card">
      <label>Season</label>
      <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (current)' : ''}</option>
        ))}
      </select>
    </div>
  );

  if (loading) return <>{seasonPicker}<p className="muted">Loading season…</p></>;
  if (error) return <>{seasonPicker}<div className="error">{error}</div></>;

  const groups = [
    ['Boys', eligible.filter((p) => p.gender === 'boys')],
    ['Girls', eligible.filter((p) => p.gender === 'girls')],
  ];

  return (
    <>
      {seasonPicker}

      <div className="card">
        <p className="eyebrow">Pick 2–{MAX_PLAYERS} players</p>
        {eligible.length === 0 && (
          <p className="muted">No {filter.holes}-hole {filter.type === 'all' ? '' : filter.type + ' '}rounds in this season yet.</p>
        )}
        {groups.map(([title, list]) => list.length > 0 && (
          <div key={title} style={{ marginBottom: 8 }}>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 4px' }}>{title}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {list.map((p) => {
                const idx = selected.indexOf(p.id);
                const on = idx >= 0;
                return (
                  <button
                    key={p.id}
                    className={on ? '' : 'secondary'}
                    style={{ ...chipBtn, opacity: !on && selected.length >= MAX_PLAYERS ? 0.45 : 1 }}
                    onClick={() => toggle(p.id)}
                  >
                    {on && <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: SERIES_COLORS[idx], marginRight: 6, border: '1px solid var(--white)' }} />}
                    {p.name}{p.archived ? ' (archived)' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {chosen.length >= 1 && <StatsTable columns={chosen.map((p) => ({ name: p.name, color: p.color, stats: p.stats }))} />}

      {chosen.length === 2 && <HeadToHead a={chosen[0]} b={chosen[1]} />}

      {chosen.length >= 1 && (
        <div className="card">
          <h2>Trend — score to par</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            {chosen.map((p) => (
              <span key={p.id} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 3, background: p.color, borderRadius: 2 }} />{p.name}
              </span>
            ))}
          </div>
          <TrendChart
            series={chosen.map((p) => ({
              name: p.name,
              color: p.color,
              points: p.filtered
                .filter((r) => isComplete(r) && r.playedOn)
                .map((r) => ({ t: Date.parse(r.playedOn), v: toPar(r.scores, r.par) })),
            }))}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Each dot is a complete round. Lower is better; the darker line is even par.
          </p>
        </div>
      )}
    </>
  );
}

function StatsTable({ columns }) {
  const rows = ROWS.filter((row) => columns.some((c) => c.stats?.[row.key] != null));
  return (
    <div className="card">
      <h2>Side by side</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th />
              {columns.map((c) => (
                <th key={c.name} className="num" style={{ borderBottom: c.color ? `3px solid ${c.color}` : undefined }}>
                  {c.name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = columns.map((c) => c.stats?.[row.key] ?? null);
              const best = bestIndexes(values, row.better);
              return (
                <tr key={row.key}>
                  <td style={{ fontSize: 13 }}>{row.label}</td>
                  {values.map((v, i) => (
                    <td
                      key={i}
                      className="num"
                      style={best.includes(i)
                        ? { background: 'var(--green-200)', color: 'var(--good-ink)', fontWeight: 700 }
                        : undefined}
                    >{row.fmt(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Highlighted = best in the row. Averages and best round use complete cards only;
        putting, greens, fairways and birdies use every hole entered. Fairways count par 4s and 5s.
      </p>
    </div>
  );
}

function HeadToHead({ a, b }) {
  const bRounds = Object.fromEntries(b.filtered.filter(isComplete).map((r) => [r.id, r]));
  let aw = 0, bw = 0, ties = 0, marginSum = 0, n = 0;
  for (const ra of a.filtered.filter(isComplete)) {
    const rb = bRounds[ra.id];
    if (!rb) continue;
    const ta = roundTotal(ra.scores), tb = roundTotal(rb.scores);
    n += 1; marginSum += tb - ta;
    if (ta < tb) aw += 1; else if (tb < ta) bw += 1; else ties += 1;
  }
  return (
    <div className="card">
      <h2>Head to head</h2>
      {n === 0 ? (
        <p className="muted">They haven't both finished the same round yet.</p>
      ) : (
        <>
          <div className="row-between" style={{ fontSize: 15 }}>
            <span style={{ fontWeight: 700, color: a.color }}>{a.name}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>
              {aw} – {ties} – {bw}
            </span>
            <span style={{ fontWeight: 700, color: b.color, textAlign: 'right' }}>{b.name}</span>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Wins – ties – wins across {n} round{n === 1 ? '' : 's'} they both finished.
            {Math.abs(marginSum / n) >= 0.05 && (
              <> On average {marginSum > 0 ? a.name.split(' ')[0] : b.name.split(' ')[0]} shot{' '}
                {Math.abs(marginSum / n).toFixed(1)} fewer strokes.</>
            )}
          </p>
        </>
      )}
    </div>
  );
}

// ---------- Seasons mode ----------

const SEASON_ROWS = [
  { key: 'players', label: 'Players with rounds', better: null, fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'complete', label: 'Full rounds', better: null, fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'teamToPar', label: 'Team match score (to par)', better: 'low', fmt: fmtSigned(1) },
  { key: 'matches', label: 'Matches counted', better: null, fmt: (v) => (v == null ? '—' : String(v)) },
  ...ROWS.filter((r) => ['avg', 'avgToPar', 'putts', 'threePutts', 'gir', 'fir', 'birdies', 'doubles', 'ud', 'sand'].includes(r.key)),
];

function CompareSeasons({ filter, getSeason }) {
  const { seasons } = useAuth();
  const active = seasons.find((s) => s.is_active);
  const other = seasons.find((s) => !s.is_active);
  const [aId, setAId] = useState(other?.id ?? '');
  const [bId, setBId] = useState(active?.id ?? seasons[0]?.id ?? '');
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!aId || !bId || aId === bId) { setA(null); setB(null); return; }
    let live = true;
    setLoading(true); setError('');
    Promise.all([getSeason(aId), getSeason(bId)])
      .then(([da, db]) => { if (live) { setA(da); setB(db); } })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [aId, bId]);

  const name = (id) => seasons.find((s) => s.id === id)?.name ?? 'Season';

  const picker = (
    <div className="card">
      <label>Compare</label>
      <select value={aId} onChange={(e) => setAId(e.target.value)}>
        <option value="">Choose a season…</option>
        {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label style={{ marginTop: 8 }}>against</label>
      <select value={bId} onChange={(e) => setBId(e.target.value)}>
        {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (current)' : ''}</option>)}
      </select>
    </div>
  );

  if (seasons.length < 2) {
    return <div className="card"><p className="muted">Season comparisons need at least two seasons. Add one under Manage → Seasons.</p></div>;
  }
  if (aId === bId || !aId) return <>{picker}<div className="card"><p className="muted">Pick two different seasons.</p></div></>;
  if (loading) return <>{picker}<p className="muted">Loading seasons…</p></>;
  if (error) return <>{picker}<div className="error">{error}</div></>;
  if (!a || !b) return picker;

  return (
    <>
      {picker}
      {['boys', 'girls'].map((g) => (
        <SeasonTable
          key={g}
          title={g === 'boys' ? 'Boys' : 'Girls'}
          aName={name(aId)} bName={name(bId)}
          sa={teamStats(a, g, filter)} sb={teamStats(b, g, filter)}
          counting={COUNTING_SCORES[g]}
        />
      ))}
    </>
  );
}

function SeasonTable({ title, aName, bName, sa, sb, counting }) {
  if (!sa && !sb) return null;
  const rows = SEASON_ROWS.filter((r) => sa?.[r.key] != null || sb?.[r.key] != null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th />
              <th className="num">{aName}</th>
              <th className="num">{bName}</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const va = sa?.[row.key] ?? null;
              const vb = sb?.[row.key] ?? null;
              let change = '';
              let color;
              if (row.better && va != null && vb != null) {
                const d = vb - va;
                const shown = Math.abs(d) < 0.05 ? 0 : d;
                const improved = row.better === 'low' ? shown < 0 : shown > 0;
                const unit = row.fmt === fmtPct ? ' pts' : '';
                change = shown === 0 ? 'same' : `${shown > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(unit ? 0 : 1)}${unit}`;
                color = shown === 0 ? 'var(--muted)' : improved ? 'var(--good-ink)' : 'var(--flag)';
              }
              return (
                <tr key={row.key}>
                  <td style={{ fontSize: 13 }}>{row.label}</td>
                  <td className="num">{row.fmt(va)}</td>
                  <td className="num">{row.fmt(vb)}</td>
                  <td className="num" style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>{change}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Team match score adds the best {counting} complete cards in each match, shown to par so
        different courses compare fairly. Green = better, red = worse.
      </p>
    </div>
  );
}
