import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import { toPar, formatToPar, roundTotal } from '../lib/scoring.js';

export default function EnterScores() {
  const { roundId } = useParams();
  const { user, isCoach } = useAuth();
  const navigate = useNavigate();

  const [round, setRound] = useState(null);
  const [par, setPar] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  // per-hole data: { [hole]: { strokes, putts, fairway, gir } }
  const [holeData, setHoleData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [comment, setComment] = useState('');
  const [commentSaved, setCommentSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: r, error: re } = await supabase
        .from('rounds')
        .select('id, played_on, type, course_id, start_hole, end_hole, courses ( name, holes, par_per_hole )')
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
          .select('hole_number, strokes, putts, fairway_hit, green_in_regulation')
          .eq('round_id', roundId)
          .eq('player_id', p.id);
        const map = {};
        (existing ?? []).forEach((s) => {
          map[s.hole_number] = {
            strokes: s.strokes,
            putts: s.putts ?? null,
            fairway: s.fairway_hit ?? null,
            gir: s.green_in_regulation ?? null,
          };
        });
        setHoleData(map);

        const { data: cmt } = await supabase
          .from('round_comments')
          .select('body')
          .eq('round_id', roundId)
          .eq('player_id', p.id)
          .maybeSingle();
        if (cmt) setComment(cmt.body);
      }
      setLoading(false);
    })();
  }, [roundId, user.id]);

  function getHole(hole) {
    return holeData[hole] ?? { strokes: par[hole - 1] ?? 4, putts: null, fairway: null, gir: null };
  }

  function adjustStrokes(hole, delta) {
    setHoleData((prev) => {
      const cur = prev[hole]?.strokes ?? par[hole - 1] ?? 4;
      const next = Math.min(20, Math.max(1, cur + delta));
      return { ...prev, [hole]: { ...getHole(hole), ...prev[hole], strokes: next } };
    });
  }

  function adjustPutts(hole, delta) {
    setHoleData((prev) => {
      const cur = prev[hole]?.putts ?? 2;
      const next = Math.min(15, Math.max(0, cur + delta));
      return { ...prev, [hole]: { ...getHole(hole), ...prev[hole], putts: next } };
    });
  }

  function toggle(hole, field) {
    setHoleData((prev) => {
      const cur = prev[hole]?.[field];
      // cycle: null -> true -> false -> null
      const next = cur === null || cur === undefined ? true : cur === true ? false : null;
      return { ...prev, [hole]: { ...getHole(hole), ...prev[hole], [field]: next } };
    });
  }

  async function saveHole(hole) {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    const h = getHole(hole);
    const strokes = h.strokes ?? par[hole - 1] ?? 4;
    const { error } = await supabase
      .from('scores')
      .upsert(
        {
          round_id: roundId,
          player_id: playerId,
          hole_number: hole,
          strokes,
          putts: h.putts,
          fairway_hit: h.fairway,
          green_in_regulation: h.gir,
        },
        { onConflict: 'round_id,player_id,hole_number' }
      );
    if (error) { setError(error.message); return; }
    setSavedNote(`Hole ${hole} saved`);
    setTimeout(() => setSavedNote(''), 1500);

    // Step 2b: auto-complete the round when every hole in range is saved.
    const sStart = round.start_hole ?? 1;
    const sEnd = round.end_hole ?? (round.courses?.holes ?? 18);
    const savedHoles = new Set([
      ...Object.keys(holeData).map(Number),
      hole, // include the hole we just saved (state may not have updated yet)
    ]);
    let allIn = true;
    for (let n = sStart; n <= sEnd; n++) {
      if (!savedHoles.has(n)) { allIn = false; break; }
    }
    if (allIn) {
      await supabase
        .from('rounds')
        .update({ status: 'complete' })
        .eq('id', roundId);
    }
  }

  async function saveComment() {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    if (!comment.trim()) return;
    const { error } = await supabase
      .from('round_comments')
      .upsert(
        { round_id: roundId, player_id: playerId, body: comment.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'round_id,player_id' }
      );
    if (error) { setError(error.message); return; }
    setCommentSaved(true);
    setTimeout(() => setCommentSaved(false), 1500);
  }

  async function deleteRound() {
    setDeleting(true);
    setError('');
    const { error } = await supabase.from('rounds').delete().eq('id', roundId);
    if (error) { setError(error.message); setDeleting(false); return; }
    navigate('/');
  }

  if (loading) return <div className="content"><p className="muted">Loading round…</p></div>;
  if (error) return <div className="content"><div className="error">{error}</div></div>;

  const startHole = round.start_hole ?? 1;
  const endHole = round.end_hole ?? (round.courses?.holes ?? 18);
  const holeNumbers = [];
  for (let h = startHole; h <= endHole; h++) holeNumbers.push(h);

  const enteredScores = holeNumbers
    .filter((h) => holeData[h])
    .map((h) => ({ hole_number: h, strokes: holeData[h].strokes }));
  const total = roundTotal(enteredScores);
  const tp = toPar(enteredScores, par);

  const rangeLabel =
    startHole === 1 && endHole === 9 ? 'Front 9'
    : startHole === 10 && endHole === 18 ? 'Back 9'
    : `${endHole - startHole + 1} holes`;

  // small toggle button helper
  const ToggleBtn = ({ value, onClick, label }) => {
    const bg = value === true ? 'var(--green-500)' : value === false ? 'var(--flag)' : 'var(--white)';
    const color = value === null || value === undefined ? 'var(--muted)' : 'var(--white)';
    const border = value === null || value === undefined ? '1.5px solid var(--line)' : 'none';
    const text = value === true ? `${label} ✓` : value === false ? `${label} ✗` : label;
    return (
      <button
        onClick={onClick}
        style={{ width: 'auto', minHeight: 38, fontSize: 12, padding: '0 10px', background: bg, color, border }}
      >{text}</button>
    );
  };

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">{round.type} · {round.played_on} · {rangeLabel}</p>
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
        <p className="muted" style={{ marginTop: 8 }}>
          Putts, fairway, and green are optional — tap to set them, or just log
          strokes and move on. Fairway/green: tap once for hit (✓), again for
          miss (✗), again to clear.
        </p>
      </div>

      {savedNote && <div className="success">{savedNote}</div>}
      {!playerId && (
        <div className="error">
          You aren't linked to the roster yet, so scores can't save.
          Ask your coach to add you on the Coach tab.
        </div>
      )}

      {holeNumbers.map((hole) => {
        const holePar = par[hole - 1];
        const h = getHole(hole);
        const val = h.strokes ?? holePar ?? 4;
        const diff = holePar ? val - holePar : null;
        const chipClass =
          diff === null ? 'even' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'even';
        const isPar3 = holePar === 3;
        return (
          <div key={hole} className="card" style={{ padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div>
                <span className="hole-num">Hole {hole}</span>
                <span className="hole-par"> · Par {holePar ?? '—'}</span>
              </div>
              <div className={`chip ${chipClass}`}>
                {diff === null ? '—' : formatToPar(diff)}
              </div>
            </div>

            {/* strokes */}
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="muted" style={{ width: 70 }}>Score</span>
              <div className="stepper">
                <button className="secondary" onClick={() => adjustStrokes(hole, -1)}>−</button>
                <span className="val">{val}</span>
                <button className="secondary" onClick={() => adjustStrokes(hole, +1)}>+</button>
              </div>
            </div>

            {/* putts */}
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="muted" style={{ width: 70 }}>Putts</span>
              <div className="stepper">
                <button className="secondary" onClick={() => adjustPutts(hole, -1)}>−</button>
                <span className="val">{h.putts ?? '—'}</span>
                <button className="secondary" onClick={() => adjustPutts(hole, +1)}>+</button>
              </div>
            </div>

            {/* fairway (not on par 3s) + green */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {!isPar3 && (
                <ToggleBtn value={h.fairway} onClick={() => toggle(hole, 'fairway')} label="Fairway" />
              )}
              <ToggleBtn value={h.gir} onClick={() => toggle(hole, 'gir')} label="Green" />
            </div>

            <button onClick={() => saveHole(hole)}>Save hole {hole}</button>
          </div>
        );
      })}

      {playerId && (
        <div className="card">
          <h2>Round notes</h2>
          <p className="muted" style={{ marginBottom: 6 }}>
            Anything worth remembering — a lost ball, a great drive, what you
            hit on a tough hole. Your coach can see this.
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            style={{
              width: '100%', borderRadius: 10, border: '1.5px solid var(--line)',
              padding: 12, fontSize: 16, fontFamily: 'var(--font-body)', color: 'var(--ink)',
            }}
            placeholder="Write a note about this round…"
          />
          {commentSaved && <div className="success">Note saved</div>}
          <div className="spacer" />
          <button onClick={saveComment} disabled={!comment.trim()}>Save note</button>
        </div>
      )}

      {isCoach && (
        <div className="card">
          {!confirmDelete ? (
            <button
              className="secondary"
              style={{ color: 'var(--flag)', borderColor: 'var(--flag)' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete this round
            </button>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 10 }}>
                Delete this round and all its scores? This can't be undone.
              </p>
              <button
                style={{ background: 'var(--flag)' }}
                onClick={deleteRound}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <div className="spacer" />
              <button className="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
