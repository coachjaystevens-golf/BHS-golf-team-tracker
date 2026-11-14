// "You're at a course that isn't in the system yet."
//
// When the phone isn't near any saved course, ask OpenStreetMap (free, public)
// which golf course it's standing on. If one is found, offer a one-tap link to
// the Add-a-course screen, pre-searched for that name, so its scorecard can be
// imported from GolfCourseAPI. GolfCourseAPI is only called if the person taps,
// which keeps the free plan's request limit untouched.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const cache = new Map(); // "lat,lng" (3 decimals ≈ 100 m) -> result

// Returns { name, lat, lng } for the golf course at (or within ~400 m of) the
// point, or null. Courses the point is inside win over nearby ones.
export async function golfCourseAt(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  const q = `[out:json][timeout:10];
is_in(${lat},${lng})->.a;
(way(pivot.a)[leisure=golf_course];relation(pivot.a)[leisure=golf_course];)->.inside;
nwr(around:400,${lat},${lng})[leisure=golf_course]->.near;
.inside out tags center;
.near out tags center;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error(`Map lookup failed (${res.status})`);
  const json = await res.json();
  const hit = (json.elements ?? []).find((e) => e.tags?.name);
  const result = hit
    ? {
        name: hit.tags.name,
        lat: hit.center?.lat ?? hit.lat ?? lat,
        lng: hit.center?.lon ?? hit.lon ?? lng,
      }
    : null;
  cache.set(key, result);
  return result;
}

// "Legends Club of Tennessee" ~ "The Legends Club" ~ "Legends Club Of Tennessee — North"
const STOP = /\b(the|golf|country|club|course|courses|links|cc|gc|of|and|at)\b/g;
function core(name) {
  return (name || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
}
// Every listed course whose name matches the map's name (a club can have several)
export function matchCourses(osmName, courses) {
  const a = core(osmName);
  if (!a) return [];
  return courses.filter((c) => {
    const b = core(c.name);
    return b && (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)));
  });
}

// Note shown under a course picker when the phone is at an unlisted course.
// If the map's course is already in the list (just without mapped greens),
// it offers "Use it" instead of adding a duplicate.
// pos: {lat,lng}; enabled: only look when the nearest-course check came back "far".
// returnTo: page to come back to after the course is added (it gets ?course=<id>).
export function UnknownCourseNote({ pos, enabled, returnTo, courses = [], courseId, onUse }) {
  const navigate = useNavigate();
  const [found, setFound] = useState(null);
  const lat = pos?.lat, lng = pos?.lng;

  useEffect(() => {
    if (!enabled || lat == null || lng == null) { setFound(null); return; }
    let live = true;
    golfCourseAt(lat, lng)
      .then((c) => { if (live) setFound(c); })
      .catch(() => { if (live) setFound(null); }); // offline / map service busy: just stay quiet
    return () => { live = false; };
  }, [enabled, lat?.toFixed(3), lng?.toFixed(3)]);

  if (!enabled || !found) return null;

  const matches = matchCourses(found.name, courses);
  if (matches.some((c) => c.id === courseId)) return null; // already picked
  if (matches.length > 1) {
    return (
      <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
        📍 You're at <strong>{found.name}</strong>. Pick which course from the list
        ({matches.map((c) => c.name).join(' or ')}).
      </p>
    );
  }
  const listed = matches[0];
  if (listed) {
    return (
      <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        📍 Looks like you're at <strong>{listed.name}</strong>.
        {onUse && (
          <button
            className="secondary"
            style={{ width: 'auto', minHeight: 30, fontSize: 12, padding: '0 10px' }}
            onClick={() => onUse(listed.id)}
          >Use it</button>
        )}
      </p>
    );
  }

  const go = () => {
    const p = new URLSearchParams({ q: found.name, lat: String(found.lat), lng: String(found.lng) });
    if (returnTo) p.set('return', returnTo);
    navigate(`/add-course?${p}`);
  };

  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--green-100)' }}>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        📍 You're at <strong>{found.name}</strong>, which isn't in your course list yet.
      </p>
      <button style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }} onClick={go}>
        Add its scorecard
      </button>
    </div>
  );
}
