import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

export default function Rounds() {
  const { isCoach } = useAuth();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [type, setType] = useState('match');
  const [playedOn, setPlayedOn] = useState(
    new Date().toISOString().slice(0, 10)
  );

  async function load() {
    setLoading(true);
    const { data: r, error: re } = await supabase
      .from('rounds')
      .select('id, played_on, type, courses ( name )')
      .order('played_on', { ascending: false });
    const { data: c } = await supabase
      .from('courses')
      .select('id, name')
      .order('name');
    if (re) setError(re.message);
    setRounds(r ?? []);
    setCourses(c ?? []);
    if (c?.length && !courseId) setCourseId(c[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createRound() {
    setError('');
    const { data, error } = await supabase
      .from('rounds')
      .insert({ course_id: courseId, type, played_on: playedOn })
      .select()
      .single();
    if (error) { setError(error.message); return; }
    setShowForm(false);
    navigate(`/round/${data.id}`);
  }

  if (loading) return <div className="content"><p className="muted">Loading rounds…</p></div>;

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}

      {isCoach && (
        <div className="card">
          {!showForm ? (
            <button onClick={() => setShowForm(true)}>+ New round</button>
          ) : (
            <>
              <h2>New round</h2>
              {courses.length === 0 ? (
                <p className="muted">
                  Add a course first (Coach tab) before creating a round.
                </p>
              ) : (
                <>
                  <label>Course</label>
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <label>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="match">Match</option>
                    <option value="practice">Practice</option>
                  </select>

                  <label>Date</label>
                  <input type="date" value={playedOn}
                    onChange={(e) => setPlayedOn(e.target.value)} />

                  <div className="spacer" />
                  <button onClick={createRound}>Create round</button>
                  <div className="spacer" />
                  <button className="secondary" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <p className="eyebrow">Rounds</p>
      {rounds.length === 0 && (
        <div className="card">
          <p className="muted">
            No rounds yet.{' '}
            {isCoach ? 'Create one above to get started.'
                     : 'Your coach will set up rounds to score.'}
          </p>
        </div>
      )}

      {rounds.map((r) => (
        <div key={r.id} className="card" onClick={() => navigate(`/round/${r.id}`)}
             style={{ cursor: 'pointer' }}>
          <div className="row-between">
            <div>
              <strong>{r.courses?.name ?? 'Course'}</strong>
              <div className="muted">{r.played_on}</div>
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