// Nearest-course auto-pick.
//
// Matches the phone's GPS position against the greens saved in
// hole_coordinates. If the closest mapped green is within NEAR_METERS, that
// course is "the one you're at". Free — no GolfCourseAPI calls. Only courses
// with at least MIN_GREENS captured greens can be matched.
//
// useNearestCourse({ enabled, pos })
//   enabled  only ask for location when true (e.g. when the new-round form is open)
//   pos      optional {lat,lng,acc} from a page that already watches GPS; when
//            given, no separate location request is made
// returns { status, match }
//   status   'idle' | 'locating' | 'found' | 'far' | 'denied' | 'unavailable'
//   match    { courseId, meters, ambiguous } when status === 'found'

import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const NEAR_METERS = 1200;   // ~3/4 mile: anywhere on a typical course
const AMBIGUOUS_METERS = 150; // two courses this close together (e.g. 36-hole clubs)
const MAX_ACCURACY = 500;   // ignore fixes worse than this
const MIN_GREENS = 3;       // a course needs a few mapped greens to be trusted (1 stray point can mislead)

let greensPromise = null; // shared across pages for the session
function loadGreens() {
  if (!greensPromise) {
    greensPromise = supabase
      .from('hole_coordinates')
      .select('course_id, front_lat, front_lng, center_lat, center_lng')
      .then(({ data, error }) => {
        if (error) { greensPromise = null; return {}; }
        const byCourse = {};
        for (const h of data ?? []) {
          const lat = h.center_lat ?? h.front_lat;
          const lng = h.center_lng ?? h.front_lng;
          if (lat == null || lng == null) continue;
          (byCourse[h.course_id] ??= []).push([lat, lng]);
        }
        return byCourse;
      });
  }
  return greensPromise;
}

function meters(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function nearestCourse(pos, greens) {
  const ranked = Object.entries(greens)
    .filter(([, pts]) => pts.length >= MIN_GREENS)
    .map(([courseId, pts]) => ({
      courseId,
      meters: Math.min(...pts.map(([lat, lng]) => meters(pos.lat, pos.lng, lat, lng))),
    }))
    .sort((a, b) => a.meters - b.meters);
  if (!ranked.length || ranked[0].meters > NEAR_METERS) return null;
  const [first, second] = ranked;
  const ambiguous = !!second && second.meters <= NEAR_METERS && second.meters - first.meters < AMBIGUOUS_METERS;
  return { ...first, ambiguous };
}

export function useNearestCourse({ enabled = true, pos = null } = {}) {
  const [greens, setGreens] = useState(null);
  const [ownPos, setOwnPos] = useState(null);
  const [error, setError] = useState(null); // 'denied' | 'unavailable'

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadGreens().then((g) => { if (live) setGreens(g); });
    return () => { live = false; };
  }, [enabled]);

  // one-shot location request, only when the page doesn't supply its own
  const needOwn = enabled && !pos;
  useEffect(() => {
    if (!needOwn || ownPos) return;
    if (!navigator.geolocation) { setError('unavailable'); return; }
    let live = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { if (live) setOwnPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
      (e) => { if (live) setError(e.code === 1 ? 'denied' : 'unavailable'); },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 12000 },
    );
    return () => { live = false; };
  }, [needOwn, ownPos]);

  const here = pos ?? ownPos;
  const usable = here && (here.acc == null || here.acc <= MAX_ACCURACY);
  const match = useMemo(
    () => (usable && greens ? nearestCourse(here, greens) : null),
    // re-check only when position moves meaningfully (~ 4th decimal ≈ 11 m)
    [usable, greens, here && here.lat.toFixed(4), here && here.lng.toFixed(4)],
  );

  let status = 'idle';
  if (enabled) {
    if (!pos && error) status = error;
    else if (!usable || !greens) status = 'locating';
    else status = match ? 'found' : 'far';
  }
  return { status, match };
}

// One-line status shown next to a course picker.
// onUse: called with a courseId when the person taps "Use it" (only shown if
// they've picked a different course by hand).
export function NearestCourseNote({ near, courses, courseId, onUse }) {
  const style = { fontSize: 12, marginTop: 6, marginBottom: 0 };
  const name = (id) => courses.find((c) => c.id === id)?.name ?? 'this course';
  const { status, match } = near;

  if (status === 'locating') return <p className="muted" style={style}>📍 Checking which course you're at…</p>;
  if (status === 'denied') return <p className="muted" style={style}>📍 Location is off, so pick the course from the list.</p>;
  if (status === 'far' || status === 'unavailable') return null;
  if (status !== 'found' || !courses.some((c) => c.id === match.courseId)) return null;

  if (match.courseId === courseId) {
    return (
      <p className="muted" style={style}>
        📍 You're at <strong>{name(match.courseId)}</strong>, so it's picked for you.
        {match.ambiguous && ' Another course is right next door, so double-check.'}
      </p>
    );
  }
  return (
    <p className="muted" style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      📍 Looks like you're at <strong>{name(match.courseId)}</strong>.
      <button
        className="secondary"
        style={{ width: 'auto', minHeight: 30, fontSize: 12, padding: '0 10px' }}
        onClick={() => onUse(match.courseId)}
      >Use it</button>
    </p>
  );
}
