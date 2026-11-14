// Pure stat math for the Compare page (no React, no Supabase) so it can be tested on its own.
import { roundTotal, toPar, scoringAverage, COUNTING_SCORES } from './scoring.js';


export function inFilter(round, f) {
  const kind = round.holeCount <= 9 ? '9' : '18';
  return kind === f.holes && (f.type === 'all' || round.type === f.type);
}

export function isComplete(round) {
  if (round.scores.length < round.holeCount) return false;
  // every entered hole needs a par, or to-par would be wrong
  return round.scores.every((s) => round.par[s.hole_number - 1] != null);
}

// Summarize a list of rounds (one player's, or a whole team's player-rounds).
export function summarize(rounds, holesPerRound) {
  if (rounds.length === 0) return null;
  const complete = rounds.filter(isComplete);
  const totals = complete.map((r) => roundTotal(r.scores));
  const toPars = complete.map((r) => toPar(r.scores, r.par));

  let holes = 0, birdiesPlus = 0, doublesPlus = 0;
  let puttsSum = 0, puttsHoles = 0, threePutts = 0;
  let fir = 0, firCh = 0, gir = 0, girH = 0;
  const parType = { 3: [0, 0], 4: [0, 0], 5: [0, 0] }; // [sum of diff, holes]
  let udM = 0, udA = 0, bnM = 0, bnA = 0;

  for (const r of rounds) {
    if (r.sg) {
      udM += r.sg.up_down_made ?? 0; udA += r.sg.up_down_attempts ?? 0;
      bnM += r.sg.bunker_made ?? 0; bnA += r.sg.bunker_attempts ?? 0;
    }
    for (const s of r.scores) {
      const hp = r.par[s.hole_number - 1];
      if (hp != null) {
        const diff = s.strokes - hp;
        holes += 1;
        if (diff <= -1) birdiesPlus += 1;
        if (diff >= 2) doublesPlus += 1;
        if (parType[hp]) { parType[hp][0] += diff; parType[hp][1] += 1; }
        if (s.fairway_hit != null && hp > 3) { firCh += 1; if (s.fairway_hit) fir += 1; }
      }
      if (s.putts != null) { puttsSum += s.putts; puttsHoles += 1; if (s.putts >= 3) threePutts += 1; }
      if (s.green_in_regulation != null) { girH += 1; if (s.green_in_regulation) gir += 1; }
    }
  }

  const rate = (n, d) => (d > 0 ? (n / d) * holesPerRound : null);
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const pt = (k) => (parType[k][1] > 0 ? parType[k][0] / parType[k][1] : null);

  return {
    rounds: rounds.length,
    complete: complete.length,
    avg: scoringAverage(totals),
    avgToPar: avg(toPars),
    best: toPars.length ? Math.min(...toPars) : null,
    putts: rate(puttsSum, puttsHoles),
    threePutts: rate(threePutts, puttsHoles),
    gir: pct(gir, girH),
    fir: pct(fir, firCh),
    birdies: rate(birdiesPlus, holes),
    doubles: rate(doublesPlus, holes),
    par3: pt(3), par4: pt(4), par5: pt(5),
    ud: pct(udM, udA),
    sand: pct(bnM, bnA),
  };
}

export function teamStats(players, gender, filter) {
  const N = filter.holes === '9' ? 9 : 18;
  const list = Object.values(players).filter((p) => p.gender === gender);
  const rounds = list.flatMap((p) => p.rounds.filter((r) => inFilter(r, filter)));
  const base = summarize(rounds, N);
  if (!base) return null;

  // team match score: per match, sum the top 4 (boys) / top 2 (girls) complete cards
  let teamToPar = null, matches = 0;
  if (filter.type !== 'practice') {
    const need = COUNTING_SCORES[gender];
    const byMatch = {};
    for (const p of list) {
      for (const r of p.rounds) {
        if (r.type !== 'match' || !inFilter(r, { ...filter, type: 'match' }) || !isComplete(r)) continue;
        (byMatch[r.id] ??= []).push(toPar(r.scores, r.par));
      }
    }
    const sums = Object.values(byMatch)
      .filter((arr) => arr.length >= need)
      .map((arr) => [...arr].sort((x, y) => x - y).slice(0, need).reduce((s, v) => s + v, 0));
    matches = sums.length;
    if (matches) teamToPar = sums.reduce((s, v) => s + v, 0) / matches;
  }

  const playerCount = list.filter((p) => p.rounds.some((r) => inFilter(r, filter))).length;
  return { ...base, players: playerCount, teamToPar, matches };
}

