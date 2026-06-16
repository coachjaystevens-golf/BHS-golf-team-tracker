import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import {
  roundTotal, toPar, formatToPar, tallyResults, scoringAverage,
} from '../lib/scoring.js';

export default function MyStats() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('players')
        .select('id, full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!p) {
        setStats(null); setLoading(false); return;
      }

      const { data: rows, error: e } = await supabase
        .from('scores')
        .select('strokes, hole_number, rounds ( id, type, courses ( par_per_hole ) )')
        .eq('player_id', p.id);
      if (e) { setError(e.message); setLoading(false); return; }

      const byRound = {};
      for (const row of rows ?? []) {
        const rid = row.rounds?.id;
        if (!rid) continue;
        if (!byRound[rid]) {
          byRound[rid] = {
            par: row.rounds.courses?.par_per_hole ?? [],
            type: row.rounds.type,
            scores: [],
          };
        }
        byRound[rid].scores.push({ hole_number: row.hole_number, strokes: row.strokes });
      }

      const roundList = Object.values(byRound);
      const totals = roundList.map((r) => roundTotal(r.scores));
      const combinedTally = { eagle: 0, birdie: 0, par: 0, bogey: 0, double_plus: 0 };
      let bestRound = null;
      for (const r of roundList) {
        const t = tallyResults(r.scores, r.par);
        for (const k in combinedTally) combinedTally[k] += t[k];
        const tp = toPar(r.scores, r.par);
        if (bestRound === null || tp < bestRound) bestRound = tp;
      }

      setStats({
        name: p.full_name,
        roundsPlayed: roundList.length,
        average: scoringAverage(totals),
        bestToPar: bestRound,
        tally: combinedTally,
      });
      setLoading(false);
    })();
  }, [user.id]);

  if (loading) return <div className="content"><p className="muted">Loading your stats…</p></div>;
  if (error) return <div className="content"><div className="error">{error}</div></div>;

  if (!stats) {
    return (
      <div className="content">
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
      <div className="card">
        <p className="eyebrow">Season so far</p>
        <h2>{stats.name}</h2>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="n">{stats.average ?? '—'}</div>
            <div className="l">Scoring average</div>
          </div>
          <div className="stat-box">
            <div className="n">{stats.roundsPlayed}</div>
            <div className="l">Rounds played</div>
          </div>
          <div className="stat-box">
            <div className="n">{stats.bestToPar === null ? '—' : formatToPar(stats.bestToPar)}</div>
            <div className="l">Best round (to par)</div>
          </div>
          <div className="stat-box">
            <div className="n">{stats.tally.birdie + stats.tally.eagle}</div>
            <div className="l">Birdies or better</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Hole results</h2>
        <table>
          <tbody>
            <tr><td>Eagles or better</td><td className="num">{stats.tally.eagle}</td></tr>
            <tr><td>Birdies</td><td className="num">{stats.tally.birdie}</td></tr>
            <tr><td>Pars</td><td className="num">{stats.tally.par}</td></tr>
            <tr><td>Bogeys</td><td className="num">{stats.tally.bogey}</td></tr>
            <tr><td>Double bogey +</td><td className="num">{stats.tally.double_plus}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}