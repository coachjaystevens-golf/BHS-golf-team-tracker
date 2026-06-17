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
  const [filter, setFilter] = useState('all'); // 'all' | 'match' | 'practice'

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
    const roundType = isCoach ? type : 'practice';
    const { data, error } = await supabase
      .from('rounds')
      .insert({ course_id: courseId, type: roundType, played_on: playedOn })
      .select()
      .single();
    if (error) { setError(error.message); return; }
    setShowForm(false);
    navigate(`/round/${data.id}`);
  }

  if (loading) return <div className="content"><p className="muted">Loading rounds…</p></div>;

  // apply the active filter to the rounds list
  const visibleRounds = rounds.filter((r) => {
    if (filter === 'all') return true;
    return r.type === filter;
  });

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}

      <div className="card">
        {!showForm ? (
          <button onClick={() => setShowForm(true)}>
            {isCoach ? '+ New round' : '+ New practice round'}
          </button>
        ) : (
          <>
            <h2>{isCoach ? 'New round' : 'New practice round'}</h2>
            {courses.length === 0 ? (
              <p className="muted">
                {isCoach
                  ? 'Add a course first (Coach tab) before creating a round.'
                  : 'No courses available yet. Ask your coach to add one.'}
              </p>
            ) : (
              <>
                <label>Course</label>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {isCoach && (
                  <>
                    <label>Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value)}>
                      <option value="match">Match</option>
                      <option value="practice">Practice</option>
                    </select>
                  </>
                )}

                <label>Date</label>
                <input type="date" value={playedOn}
                  onChange={(e) => setPlayedOn(e.target.value)} />

                <div className="spacer" />
                <button onClick={createRound}>
                  {isCoach ? 'Create round' : 'Create practice round'}
                </button>
                <div className="spacer" />
                <button className="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={filter === 'all' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('all')}
          >All</button>
          <button
            className={filter === 'match' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('match')}
          >Matches</button>
          <button
            className={filter === 'practice' ? '' : 'secondary'}
            style={{ fontSize: 14, padding: '0 8px' }}
            onClick={() => setFilter('practice')}
          >Practice</button>
        </div>
      </div>

      <p className="eyebrow">Rounds</p>
      {visibleRounds.length === 0 && (
        <div className="card">
          <p className="muted">
            {rounds.length === 0
              ? (isCoach ? 'No rounds yet. Create one above to get started.'
                         : 'No rounds yet. Create a practice round above, or your coach will set up matches.')
              : 'No rounds match this filter.'}
          </p>
        </div>
      )}

      {visibleRounds.map((r) => (
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
