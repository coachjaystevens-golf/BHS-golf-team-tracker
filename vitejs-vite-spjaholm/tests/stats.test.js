// Automatic checks for the stat math every coach and player sees.
// Run with:  npm test   (also runs on every GitHub pull request)
//
// These lock in the fixes from Nov 2026: unfinished cards must not count
// toward averages, putts/round is per hole logged, 9s and 18s never mix,
// and season queries must read past Supabase's 1,000-row limit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, inFilter, isComplete, teamStats } from '../src/lib/compareStats.js';
import { roundTotal, toPar, teamScore, tallyResults, formatToPar } from '../src/lib/scoring.js';
import { fetchAll } from '../src/lib/fetchAll.js';

const PAR18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]; // par 72

// a round where every hole is scored `over` par, with optional putts
function round({ id = 'r1', holes = 18, over = 1, putts = null, type = 'match', playedOn = '2026-09-01', skip = [] } = {}) {
  const scores = [];
  for (let h = 1; h <= holes; h++) {
    if (skip.includes(h)) continue;
    scores.push({ hole_number: h, strokes: PAR18[h - 1] + over, putts, fairway_hit: null, green_in_regulation: null });
  }
  return { id, type, playedOn, holeCount: holes, par: PAR18, sg: null, scores };
}

test('scoring basics', () => {
  const r = round({ over: 1 });
  assert.equal(roundTotal(r.scores), 90);
  assert.equal(toPar(r.scores, r.par), 18);
  assert.equal(formatToPar(0), 'E');
  assert.equal(formatToPar(-2), '-2');
  const t = tallyResults(r.scores, r.par);
  assert.equal(t.bogey, 18);
});

test('a card with missing holes is not complete', () => {
  assert.equal(isComplete(round()), true);
  assert.equal(isComplete(round({ skip: [10, 11] })), false);
});

test('averages ignore unfinished cards (the 54.7-vs-85.5 bug)', () => {
  const full = round({ id: 'a', over: 1 });          // 90
  const half = round({ id: 'b', over: 1, skip: [10, 11, 12, 13, 14, 15, 16, 17, 18] }); // 9 holes entered
  const s = summarize([full, half], 18);
  assert.equal(s.rounds, 2);
  assert.equal(s.complete, 1);
  assert.equal(s.avg, 90);        // NOT (90 + 45) / 2
  assert.equal(s.best, 18);
});

test('putts per round uses holes where putts were logged', () => {
  // 18 holes logged at 2 putts + a card with putts on only 3 holes
  const a = round({ id: 'a', putts: 2 });
  const b = round({ id: 'b', putts: null });
  b.scores[0].putts = 2; b.scores[1].putts = 2; b.scores[2].putts = 2;
  const s = summarize([a, b], 18);
  assert.equal(Math.round(s.putts * 10) / 10, 36); // 2 per hole × 18, not 42/2 rounds
});

test('9-hole and 18-hole rounds are filtered apart', () => {
  const nine = round({ id: 'n', holes: 9 });
  const eighteen = round({ id: 'e' });
  assert.equal(inFilter(nine, { holes: '9', type: 'all' }), true);
  assert.equal(inFilter(nine, { holes: '18', type: 'all' }), false);
  assert.equal(inFilter(eighteen, { holes: '18', type: 'match' }), true);
  assert.equal(inFilter(eighteen, { holes: '18', type: 'practice' }), false);
});

test('team match score counts the best 4 boys / best 2 girls', () => {
  const t = teamScore([{ total: 80 }, { total: 75 }, { total: 90 }, { total: 78 }, { total: 85 }], 'boys');
  assert.equal(t.total, 75 + 78 + 80 + 85);
  assert.equal(t.dropped.length, 1);
  const g = teamScore([{ total: 95 }, { total: 88 }, { total: 101 }], 'girls');
  assert.equal(g.total, 88 + 95);
});

test('season team stats: only complete cards count toward the team score', () => {
  const players = {};
  const overs = [0, 1, 2, 3, 4];
  overs.forEach((o, i) => {
    players[`p${i}`] = { id: `p${i}`, gender: 'boys', rounds: [round({ id: 'm1', over: o })] };
  });
  // the best player's card is unfinished, so the best 4 COMPLETE cards count
  players.p0.rounds[0].scores.pop();
  const s = teamStats(players, 'boys', { holes: '18', type: 'all' });
  assert.equal(s.matches, 1);
  assert.equal(s.teamToPar, 18 + 36 + 54 + 72);
});

test('fetchAll reads every page past the 1,000-row limit', async () => {
  const TOTAL = 2217;
  const rows = Array.from({ length: TOTAL }, (_, i) => ({ id: i }));
  let calls = 0;
  const build = () => ({
    order() { return this; },
    range(from, to) { calls += 1; return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }); },
  });
  const { data, error } = await fetchAll(build);
  assert.equal(error, null);
  assert.equal(data.length, TOTAL);
  assert.equal(calls, 3);
});

test('fetchAll passes errors through', async () => {
  const build = () => ({ order() { return this; }, range() { return Promise.resolve({ data: null, error: { message: 'boom' } }); } });
  const { data, error } = await fetchAll(build);
  assert.equal(data, null);
  assert.equal(error.message, 'boom');
});
