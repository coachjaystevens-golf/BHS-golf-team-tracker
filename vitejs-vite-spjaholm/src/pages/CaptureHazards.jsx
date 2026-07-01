import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

// Great-circle distance in YARDS (same as Caddie/Capture).
function yardsBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.09361;
}

export default function CaptureHazards() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  // hole_number -> { carry: {front_lat,...,back_lat,...}, aim: {front_lat,...} }
  const [hazards, setHazards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // live GPS (mirrors CaptureCourse)
  const [pos, setPos] = useState(null); // {lat,lng,acc}
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

  async function loadHazards(cid) {
    if (!cid) return;
    const { data } = await supabase
      .from('hole_hazards')
      .select('hole_number, hazard_type, label, front_lat, front_lng, back_lat, back_lng')
      .eq('course_id', cid);
    const map = {};
    (data ?? []).forEach((r) => {
      if (!map[r.hole_number]) map[r.hole_number] = {};
      map[r.hole_number][r.hazard_type] = r;
    });
    setHazards(map);
  }
  useEffect(() => { loadHazards(courseId); }, [courseId]);

  const course = courses.find((c) => c.id === courseId);
  const holeCount = course?.holes ?? 18;

  // Capture a point. type='carry' with which 'front'|'back', or type='aim' (front only).
  async function capture(hole, type, which) {
    setError(''); setNote('');
    if (!pos) { setError('No GPS fix yet. Wait for a location, outside if possible.'); return; }
    const existing = hazards[hole]?.[type] ?? {};
    const patch = which === 'back'
      ? { back_lat: pos.lat, back_lng: pos.lng }
      : { front_lat: pos.lat, front_lng: pos.lng };

    const row = {
      course_id: courseId,
      hole_number: hole,
      hazard_type: type,
      label: existing.label ?? null,
      front_lat: existing.front_lat ?? null,
      front_lng: existing.front_lng ?? null,
      back_lat: existing.back_lat ?? null,
      back_lng: existing.back_lng ?? null,
      ...patch,
    };
    const { error } = await supabase
      .from('hole_hazards')
      .upsert(row, { onConflict: 'course_id,hole_number,hazard_type' });
    if (error) { setError(error.message); return; }
    const nm = type === 'aim' ? 'aim point' : `water ${which} edge`;
    setNote(`Hole ${hole} ${nm} recorded (±${Math.round(pos.acc)}m)`);
    setTimeout(() => setNote(''), 2000);
    loadHazards(courseId);
  }

  // Remove one hazard type from a hole (clears the whole row).
  async function clearHazard(hole, type) {
    setError(''); setNote('');
    const { error } = await supabase
      .from('hole_hazards')
      .delete()
      .eq('course_id', courseId)
      .eq('hole_number', hole)
      .eq('hazard_type', type);
    if (error) { setError(error.message); return; }
    setNote(`Hole ${hole} ${type === 'aim' ? 'aim point' : 'water'} cleared`);
    setTimeout(() => setNote(''), 2000);
    loadHazards(courseId);
  }

  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Course mapping</p>
        <h2>Capture hazards</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Only mark the holes that need it. For water, stand at the near edge and
          tap "Water front," then walk to the far edge and tap "Water back" — that
          gives players distance-to-water and carry-to-clear. For a dogleg or
          layup, stand on the spot and tap "Aim point." Holes you skip show
          nothing to players.
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
        const carry = hazards[hole]?.carry ?? {};
        const aim = hazards[hole]?.aim ?? {};
        const hasFront = carry.front_lat != null;
        const hasBack = carry.back_lat != null;
        const hasAim = aim.front_lat != null;

        // If both carry edges exist, show the resulting carry distance as a sanity check.
        let carryYds = null;
        if (hasFront && hasBack) {
          carryYds = Math.round(
            yardsBetween(carry.front_lat, carry.front_lng, carry.back_lat, carry.back_lng)
          );
        }

        return (
          <div key={hole} className="card" style={{ padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <strong>Hole {hole}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {(hasFront || hasBack) ? 'water ✓' : 'water —'}
                {' · '}
                {hasAim ? 'aim ✓' : 'aim —'}
              </span>
            </div>

            {/* Water carry */}
            <div style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Water carry
                {carryYds != null && (
                  <span> — spans ~{carryYds} yds front-to-back</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className={hasFront ? 'secondary' : ''}
                  onClick={() => capture(hole, 'carry', 'front')}
                  disabled={!pos}
                >
                  {hasFront ? 'Re-do water front' : 'Water front'}
                </button>
                <button
                  className={hasBack ? 'secondary' : ''}
                  onClick={() => capture(hole, 'carry', 'back')}
                  disabled={!pos}
                >
                  {hasBack ? 'Re-do water back' : 'Water back'}
                </button>
                {(hasFront || hasBack) && (
                  <button className="secondary" onClick={() => clearHazard(hole, 'carry')}>
                    Clear water
                  </button>
                )}
              </div>
            </div>

            {/* Aim point */}
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Aim point (dogleg / layup)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className={hasAim ? 'secondary' : ''}
                  onClick={() => capture(hole, 'aim', 'front')}
                  disabled={!pos}
                >
                  {hasAim ? 'Re-do aim point' : 'Aim point'}
                </button>
                {hasAim && (
                  <button className="secondary" onClick={() => clearHazard(hole, 'aim')}>
                    Clear aim
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
