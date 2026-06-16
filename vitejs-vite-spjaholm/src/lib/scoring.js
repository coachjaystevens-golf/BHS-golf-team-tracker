export const COUNTING_SCORES = {
  boys: 4,
  girls: 2,
};

export function roundTotal(scores) {
  return scores.reduce((sum, s) => sum + s.strokes, 0);
}

export function parForHoles(scores, parPerHole) {
  return scores.reduce((sum, s) => {
    const par = parPerHole[s.hole_number - 1];
    return sum + (par ?? 0);
  }, 0);
}

export function toPar(scores, parPerHole) {
  return roundTotal(scores) - parForHoles(scores, parPerHole);
}

export function formatToPar(value) {
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : `${value}`;
}

export function holeResult(strokes, par) {
  const diff = strokes - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double_plus';
}

export function tallyResults(scores, parPerHole) {
  const tally = { eagle: 0, birdie: 0, par: 0, bogey: 0, double_plus: 0 };
  for (const s of scores) {
    const par = parPerHole[s.hole_number - 1];
    if (par == null) continue;
    tally[holeResult(s.strokes, par)] += 1;
  }
  return tally;
}

export function teamScore(players, gender) {
  const need = COUNTING_SCORES[gender];
  const sorted = [...players].sort((a, b) => a.total - b.total);
  const counting = sorted.slice(0, need);
  const dropped = sorted.slice(need);
  const total = counting.reduce((sum, p) => sum + p.total, 0);
  return {
    total,
    counting,
    dropped,
    complete: players.length >= need,
  };
}

export function scoringAverage(roundTotals) {
  if (roundTotals.length === 0) return null;
  const sum = roundTotals.reduce((a, b) => a + b, 0);
  return Math.round((sum / roundTotals.length) * 10) / 10;
}