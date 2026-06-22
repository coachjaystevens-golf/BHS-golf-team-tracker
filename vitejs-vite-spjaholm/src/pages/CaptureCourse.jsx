import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

export default function CaptureCourse() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [coords, setCoords] = useState({}); // hole_number -> {front_lat,...}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // live GPS
  const [pos, setPos] = useState(null);   // {lat,lng,acc}
  const [gpsErr, setGpsErr] = useState('');
  const watchId = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('courses').select('id, name, holes').order('name');
      setCourses(data ?? []);
      if (data?.length) setCourseId(data[0].id);
      setLoading(false);
    })();
  }, []);

  // start watching GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGpsErr('This device has no GPS.'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setGpsErr('');
      },
      (e) => setGpsErr(e.message || 'Location unavailable. Allow location access and try outside.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  async function loadCoords(cid) {
    if (!cid) return;
    const { data } = await supabase
      .from('hole_coordinates')
      .select('hole_number, front_lat, front_lng, center_lat, center_lng')
      .eq('course_id', cid);
    const map = {};
    (data ?? []).forEach((r) => { map[r.hole_number] = r; });
    setCoords(map);
  }
  useEffect(() => { loadCoords(courseId); }, [courseId]);

  const course = courses.find((c) => c.id === courseId);
  const holeCount = course?.holes ?? 18;

  async function capture(hole, which) {
    setError(''); setNote('');
    if (!pos) { setError('No GPS fix yet. Wait for a location, outside if possible.'); return; }
    const existing = coords[hole] ?? {};
    const patch = which === 'front'
      ? { front_lat: pos.lat, front_lng: pos.lng }
      : { center_lat: pos.lat, center_lng: pos.lng };

    const row = {
      course_id: courseId,
      hole_number: hole,
      front_lat: existing.front_lat ?? null,
      front_lng: existing.front_lng ?? null,
      center_lat: existing.center_lat ?? null,
      center_lng: existing.center_lng ?? null,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('hole_coordinates')
      .upsert(row, { onConflict: 'course_id,hole_number' });
    if (error) { setError(error.message); return; }
    setNote(`Hole ${hole} ${which} recorded (±${Math.round(pos.acc)}m)`);
    setTimeout(() => setNote(''), 2000);
    loadCoords(courseId);
  }

  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Course mapping</p>
        <h2>Capture greens</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Stand on the green and tap to record its location. Do "Front" from the
          front edge and "Center" from the middle. You can capture over several
          visits — each hole saves on its own.
        </p>
        <label>Course</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* GPS status */}
      <div className="card" style={{ background: pos ? 'var(--green-100)' : '#f6dcd9' }}>
        {gpsErr ? (
          <p style={{ color: 'var(--flag)', margin: 0 }}>{gpsErr}</p>
        ) : pos ? (
          <p className="muted" style={{ margin: 0 }}>
            GPS live · accuracy ±{Math.round(pos.acc)} m. Closer to ±5 m is best —
            wait a moment outside if it's high.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Getting your location…</p>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {note && <div className="success">{note}</div>}

      {Array.from({ length: holeCount }, (_, i) => i + 1).map((hole) => {
        const c = coords[hole] ?? {};
        const hasFront = c.front_lat != null;
        const hasCenter = c.center_lat != null;
        return (
          <div key={hole} className="card" style={{ padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <strong>Hole {hole}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {hasFront ? 'front ✓' : 'front —'} · {hasCenter ? 'center ✓' : 'center —'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={hasFront ? 'secondary' : ''}
                onClick={() => capture(hole, 'front')}
                disabled={!pos}
              >
                {hasFront ? 'Re-do front' : 'Record front'}
              </button>
              <button
                className={hasCenter ? 'secondary' : ''}
                onClick={() => capture(hole, 'center')}
                disabled={!pos}
              >
                {hasCenter ? 'Re-do center' : 'Record center'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
