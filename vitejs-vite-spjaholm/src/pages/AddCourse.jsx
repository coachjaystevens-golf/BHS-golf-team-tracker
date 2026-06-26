import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const API_BASE = 'https://api.golfcourseapi.com';
const API_KEY = import.meta.env.VITE_GOLF_API_KEY;

export default function AddCourse() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // array of search hits
  const [picked, setPicked] = useState(null);   // the full course being confirmed
  const [parList, setParList] = useState([]);    // editable par array for confirm
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function search() {
    setError(''); setInfo(''); setResults(null); setPicked(null);
    if (!query.trim()) return;
    if (!API_KEY) { setError('Course search is not configured. Ask your coach.'); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `${API_BASE}/v1/search?search_query=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      if (!res.ok) {
        setError(res.status === 401 ? 'Course search key was rejected. Ask your coach.' : `Search failed (${res.status}).`);
        setSearching(false);
        return;
      }
      const data = await res.json();
      const hits = data.courses ?? [];
      setResults(hits);
      if (hits.length === 0) setInfo('No courses found. Try a different spelling or include the city.');
    } catch {
      setError('Could not reach the course search. Check your connection.');
    }
    setSearching(false);
  }

  async function pick(hit) {
    setError(''); setInfo('');
    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/v1/courses/${hit.id}`, {
        headers: { Authorization: `Key ${API_KEY}` },
      });
      if (!res.ok) { setError(`Could not load that course (${res.status}).`); setImporting(false); return; }
      const full = await res.json();

      // pull a hole list from the first available tee (male, else female)
      const tees = full.tees ?? {};
      const teeSet = (tees.male && tees.male[0]) || (tees.female && tees.female[0]) || null;
      const holes = teeSet?.holes ?? [];
      const pars = holes.map((h) => h.par).filter((p) => p != null);

      setPicked({
        id: hit.id,
        club_name: full.club_name ?? hit.club_name ?? '',
        course_name: full.course_name ?? hit.course_name ?? '',
        location: full.location ?? hit.location ?? {},
        holeCount: pars.length || 18,
      });
      setParList(pars);
    } catch {
      setError('Could not load that course. Try again.');
    }
    setImporting(false);
  }

  async function confirmAdd() {
    setError(''); setInfo('');
    const displayName = picked.course_name && picked.club_name && picked.course_name !== picked.club_name
      ? `${picked.club_name} — ${picked.course_name}`
      : (picked.course_name || picked.club_name);

    if (parList.length === 0) { setError('This course has no hole data to import. Pick another or ask your coach to add it manually.'); return; }

    setImporting(true);

    // Duplicate guard: don't add a course that already exists by name.
    const { data: existing } = await supabase
      .from('courses')
      .select('id, name')
      .ilike('name', displayName);
    if (existing && existing.length > 0) {
      setInfo(`"${displayName}" is already in the course list — you can use it now.`);
      setImporting(false);
      return;
    }

    const { error: insErr } = await supabase.from('courses').insert({
      name: displayName,
      holes: parList.length,
      par_per_hole: parList,
    });
    setImporting(false);
    if (insErr) { setError(insErr.message); return; }

    setInfo(`"${displayName}" added! You can now create a round on it.`);
    setPicked(null);
    setResults(null);
    setQuery('');
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Course search</p>
        <h2>Add a course</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Search for a course you're playing — handy for practice rounds away
          from home. It gets added to the course list for the whole team.
        </p>
        <label>Course or club name</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Pebble Creek, or include the city"
        />
        <div className="spacer" />
        <button onClick={search} disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      {/* search results */}
      {results && results.length > 0 && !picked && (
        <div className="card">
          <p className="eyebrow">Results — tap to choose</p>
          {results.map((hit) => (
            <div
              key={hit.id}
              className="row-between"
              style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => pick(hit)}
            >
              <div>
                <strong>{hit.course_name || hit.club_name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {hit.club_name && hit.club_name !== hit.course_name ? hit.club_name + ' · ' : ''}
                  {hit.location?.city ? `${hit.location.city}, ` : ''}{hit.location?.state ?? ''}
                </div>
              </div>
              <span className="muted">→</span>
            </div>
          ))}
        </div>
      )}

      {importing && !picked && <p className="muted">Loading course…</p>}

      {/* confirm screen */}
      {picked && (
        <div className="card">
          <p className="eyebrow">Confirm this course</p>
          <h2 style={{ marginBottom: 4 }}>
            {picked.course_name || picked.club_name}
          </h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            {picked.club_name && picked.club_name !== picked.course_name ? picked.club_name + ' · ' : ''}
            {picked.location?.city ? `${picked.location.city}, ` : ''}{picked.location?.state ?? ''}
            {' · '}{parList.length} holes · par {parList.reduce((a, b) => a + b, 0)}
          </p>

          {parList.length === 0 ? (
            <div className="error">
              This course doesn't have hole-by-hole data available. Pick another
              result, or ask your coach to add it manually.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Hole</th>
                    {parList.map((_, i) => <th key={i} className="num">{i + 1}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="muted">Par</td>
                    {parList.map((p, i) => <td key={i} className="num">{p}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="spacer" />
          <button onClick={confirmAdd} disabled={importing || parList.length === 0}>
            {importing ? 'Adding…' : 'Add this course'}
          </button>
          <div className="spacer" />
          <button className="secondary" onClick={() => { setPicked(null); setParList([]); }}>
            Back to results
          </button>
        </div>
      )}
    </div>
  );
}
