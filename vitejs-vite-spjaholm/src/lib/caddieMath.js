// caddieMath.js
// ----------------------------------------------------------
// Shared math for the GPS Caddie club-distance learning.
//  - yardsBetween: great-circle distance between two GPS points
//  - recencyWeightedAvg: favors recent shots, light outlier filtering
//  - suggestClub: picks the club whose learned distance is closest
// All pure functions — no side effects, easy to reason about.
// ----------------------------------------------------------

// Great-circle distance between two lat/lng points, in YARDS.
export function yardsBetween(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000; // earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.09361; // meters -> yards
}

// Minimum shots before a club's learned distance is "trusted".
export const MIN_SHOTS = 5;

// Compute a recency-weighted average distance for one club from a
// list of shot yardages, where the LAST item is the most recent.
// - Light outlier filtering: drop shots far from the median.
// - Recency weighting: newer shots count more (linear ramp).
// Returns { avg, count } using only the kept (non-outlier) shots.
export function recencyWeightedAvg(yards) {
  const vals = (yards ?? []).filter((y) => typeof y === 'number' && y > 0);
  if (vals.length === 0) return { avg: null, count: 0 };
  if (vals.length === 1) return { avg: Math.round(vals[0]), count: 1 };

  // median for outlier reference
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // keep shots within 35% of the median (drops shanks/tops/flukes)
  const kept = vals.filter((v) => Math.abs(v - median) <= median * 0.35);
  const use = kept.length >= 1 ? kept : vals;

  // recency weighting: oldest weight 1, newest weight = use.length
  let wsum = 0;
  let weighted = 0;
  use.forEach((v, i) => {
    const w = i + 1; // later index = more recent = heavier
    weighted += v * w;
    wsum += w;
  });

  return { avg: Math.round(weighted / wsum), count: use.length };
}

// A rough generic chart for high-school golfers, used as a fallback
// suggestion before a player has enough of their own data.
// Distances are typical carry yardages; intentionally approximate.
export const GENERIC_YARDS = {
  Driver: 230, '3w': 210, '5w': 195, '3h': 190, '4h': 180,
  '3i': 180, '4i': 170, '5i': 160, '6i': 150, '7i': 140,
  '8i': 130, '9i': 118, PW: 105, GW: 95, SW: 80, LW: 65,
};

// Given a target distance and the player's clubs (each with an
// optional learned avg_yards + shot_count), pick the best club.
// Blended strategy:
//   - Find the closest TRUSTED learned club (>= MIN_SHOTS shots).
//   - Find the closest GENERIC club from the player's bag.
//   - Prefer the learned club when it's a reasonable match for the
//     target; otherwise use generic. This avoids suggesting a kid's
//     only-logged 7-iron for a 210-yard shot.
// Returns { club, label, source: 'learned'|'generic', diff, dist } or null.
const LEARNED_MATCH_WINDOW = 25; // yards; learned club must be within this

export function suggestClub(targetYards, clubs) {
  if (targetYards == null || !clubs || clubs.length === 0) return null;

  const closest = (pool, distOf) => {
    let best = null;
    for (const c of pool) {
      const dist = distOf(c);
      if (dist == null) continue;
      const diff = Math.abs(dist - targetYards);
      if (best == null || diff < best.diff) {
        best = { club: c.club, label: c.label, diff: Math.round(diff), dist: Math.round(dist) };
      }
    }
    return best;
  };

  const trusted = clubs.filter((c) => c.avg_yards != null && c.shot_count >= MIN_SHOTS);
  const bestLearned = closest(trusted, (c) => c.avg_yards);
  const bestGeneric = closest(clubs, (c) => GENERIC_YARDS[c.club]);

  // Use the learned club only if it's a sensible match for this distance.
  if (bestLearned && bestLearned.diff <= LEARNED_MATCH_WINDOW) {
    return { ...bestLearned, source: 'learned' };
  }
  if (bestGeneric) {
    return { ...bestGeneric, source: 'generic' };
  }
  // no generic data either (unusual) — fall back to learned if present
  return bestLearned ? { ...bestLearned, source: 'learned' } : null;
}
