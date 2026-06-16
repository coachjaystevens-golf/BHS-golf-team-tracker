import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import { toPar, formatToPar, roundTotal } from '../lib/scoring.js';

export default function EnterScores() {
  const { roundId } = useParams();
  const { user, isCoach } = useAuth();

  const [round, setRound] = useState(null);
  const [par, setPar] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  const [strokes, setStrokes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: r, error: re } = await supabase
        .from('rounds')
        .select('id, played_on, type, course_id, courses ( name, holes, par_per_hole )')
        .eq('id', roundId)
        .single();
      if (re) { setError(re.message); setLoading(false); return; }
      setRound(r);
      setPar(r.courses?.par_per_hole ?? []);

      const { data: p } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (p) {
        setPlayerId(p.id);
        const { data: existing } = await supabase
          .from('scores')
          .select('hole_number, strokes')
          .eq('round_id', roundId)
          .eq('player_id', p.id);
        const map = {};
        (existing ?? []).forEach((s) => { map[s.hole_number] = s.strokes; });
        setStrokes(map);
      }
      setLoading(false);
    })();
  }, [roundId, user.id]);

  function adjust(hole, delta) {
    setStrokes((prev) => {
      const cur = prev[hole] ?? par[hole - 1] ?? 4;
      const next = Math.min(20, Math.max(1, cur + delta));
      return { ...prev, [hole]: next };
    });
  }

  async function saveHole(hole) {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    const value = strokes[hole] ?? par[hole - 1] ?? 4;
    const { error } = await supabase
      .from('scores')
      .upsert(
        { round_id: roundId, player_id: playerId, hole_number: hole, strokes: value },
        { onConflict: 'round_id,player_id,hole_number' }
      );
    if (error) { setError(error.message); return; }
    setSavedNote(`Hole ${hole} saved`);
    setTimeout(() => setSavedNote(''), 1500);
  }

  if (loading) return <div className="content"><p className="muted">Loading round…</p></div>;
  if (error) return <div className="content"><div className="error">{error}</div></div>;

  const holes = round.courses?.holes ?? 18;
  const enteredScores = Object.entries(strokes).map(([h, s]) => ({
    hole_number: Number(h), strokes: s,
  }));
  const total = roundTotal(enteredScores);
  const tp = toPar(enteredScores, par);

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">{round.type} · {round.played_on}</p>
        <h2>{round.courses?.name}</h2>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="n">{total || '—'}</div>
            <div className="l">Total strokes</div>
          </div>
          <div className="stat-box">
            <div className="n">{enteredScores.length ? formatToPar(tp) : '—'}</div>
            <div className="l">To par</div>
          </div>
        </div>
      </div>

      {savedNote && <div className="success">{savedNote}</div>}
      {!playerId && (
        <div className="error">
          You aren't linked to the roster yet, so scores can't save.
          Ask your coach to add you on the Coach tab.
        </div>
      )}

      <div className="card">
        {Array.from({ length: holes }, (_, i) => i + 1).map((hole) => {
          const holePar = par[hole - 1];
          const val = strokes[hole] ?? holePar ?? 4;
          const diff = holePar ? val - holePar : null;
          const chipClass =
            diff === null ? 'even' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'even';
          return (
            <div key={hole} className="hole-row">
              <div>
                <div className="hole-num">{hole}</div>
                <div className="hole-par">Par {holePar ?? '—'}</div>
              </div>
              <div className="stepper">
                <button className="secondary" onClick={() => adjust(hole, -1)}>−</button>
                <span className="val">{val}</span>
                <button className="secondary" onClick={() => adjust(hole, +1)}>+</button>
              </div>
              <div className={`chip ${chipClass}`}>
                {diff === null ? '—' : formatToPar(diff)}
              </div>
              <button onClick={() => saveHole(hole)} style={{ padding: 0 }}>
                Save
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}