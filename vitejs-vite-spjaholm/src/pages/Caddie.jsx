import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

// Great-circle distance between two lat/lng points, returned in YARDS.
function yardsBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000; // earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;
  return meters * 1.09361; // meters -> yards
}

export default function Caddie() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [coords, setCoords] = useState({}); // hole_number -> {front_lat,...,center_lat,...}
  const [loading, setLoading] = useState(true);

  // live GPS (mirrors CaptureCourse pattern)
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

  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;

  const course = courses.find((c) => c.id === courseId);
  const holeCount = course?.holes ?? 18;
  const mappedHoles = Object.keys(coords).length;

  // distance from current position to a stored point, or null if unavailable
  const distTo = (lat, lng) => {
    if (!pos || lat == null || lng == null) return null;
    return Math.round(yardsBetween(pos.lat, pos.lng, lat, lng));
  };

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">GPS Caddie</p>
        <h2>Yardages</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Live distance to the front and center of each green, from where you're
          standing. Only holes that have been mapped show yardages.
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
            GPS live · accuracy ±{Math.round(pos.acc)} m. Yardages are only as
            good as the fix — closer to ±5 m is best.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Getting your location…</p>
        )}
      </div>

      {mappedHoles === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            This course hasn't been mapped yet. A capture helper can record green
            locations on the Capture tab, then yardages show up here.
          </p>
        </div>
      )}

      {mappedHoles > 0 && Array.from({ length: holeCount }, (_, i) => i + 1).map((hole) => {
        const c = coords[hole] ?? {};
        const hasAny = c.front_lat != null || c.center_lat != null;
        const toFront = distTo(c.front_lat, c.front_lng);
        const toCenter = distTo(c.center_lat, c.center_lng);
        return (
          <div key={hole} className="card" style={{ padding: 14 }}>
            <div className="row-between">
              <strong>Hole {hole}</strong>
              {!hasAny && <span className="muted" style={{ fontSize: 12 }}>not mapped</span>}
            </div>
            {hasAny && (
              <div className="stat-grid" style={{ marginTop: 8 }}>
                <div className="stat-box">
                  <div className="n">{toCenter == null ? '—' : `${toCenter} yds`}</div>
                  <div className="l">to center{c.center_lat == null ? ' (not mapped)' : ''}</div>
                </div>
                <div className="stat-box">
                  <div className="n">{toFront == null ? '—' : `${toFront} yds`}</div>
                  <div className="l">to front{c.front_lat == null ? ' (not mapped)' : ''}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
