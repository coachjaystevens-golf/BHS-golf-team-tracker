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
        .select('strokes, hole_number, rounds!inner ( id, type, season_id, start_hole, end_hole, courses ( par_per_hole ) )')
        .eq('player_id', p.id)
        .eq('rounds.season_id', seasonId);
      if (e) { setError(e.message); setLoading(false); return; }

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
            scores: [],
          };
        }
        byRound[rid].scores.push({ hole_number: row.hole_number, strokes: row.strokes });
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
        for (const r of list) {
          const t = tallyResults(r.scores, r.par);
          for (const k in tally) tally[k] += t[k];
          const tp = toPar(r.scores, r.par);
          if (best === null || tp < best) best = tp;
        }
        return {
          rounds: list.length,
          average: scoringAverage(totals),
          bestToPar: best,
          tally,
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
      {!data.empty && (
        <>
          <StatBlock label="18-hole rounds" s={data.full18} />
          <StatBlock label="9-hole rounds" s={data.nine} />
        </>
      )}
    </div>
  );
}
