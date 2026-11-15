// ---- MatchResults: one-tap shareable results for a round (Coach → Scores) ----
//
// Builds a plain-text summary (team scores, every player's total and to-par,
// low medalist, who counted) that can be shared to Messages/email/social with
// the phone's share sheet or copied, plus a printable sheet (print or save as
// PDF) with hole-by-hole cards.

import { useState } from 'react';
import { formatToPar } from '../lib/scoring.js';

const fmtDate = (d) => (d
  ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  : '');

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// result: { boys, girls, boysList, girlsList, par } from TeamScores
// round:  { played_on, type, courses: { name } }
export default function MatchResults({ result, round, holeCount, startHole = 1 }) {
  const [copied, setCopied] = useState(false);
  if (!result || !round) return null;

  const appName = document.title || 'Golf';
  const course = round.courses?.name ?? 'Course';
  const nHoles = holeCount || result.par.length || 18;
  const parTotal = result.par.slice(startHole - 1, startHole - 1 + nHoles).reduce((a, b) => a + (b ?? 0), 0);

  const teams = [
    ['Boys', result.boys, result.boysList, 4],
    ['Girls', result.girls, result.girlsList, 2],
  ].filter(([, , list]) => list.length > 0);
  if (teams.length === 0) return null;

  const everyone = teams.flatMap(([, , list]) => list);
  const done = (p) => p.scores.length >= nHoles;
  const finished = everyone.filter(done);
  const lowScore = finished.length ? Math.min(...finished.map((p) => p.total)) : null;
  const medalists = finished.filter((p) => p.total === lowScore);

  // ---------- text version ----------
  const lines = [];
  lines.push(`${appName}: ${round.type === 'match' ? 'Match results' : 'Round results'}`);
  lines.push(`${fmtDate(round.played_on)} · ${course}${parTotal ? ` (par ${parTotal})` : ''}`);
  for (const [title, team, list, need] of teams) {
    const counting = new Set(team.counting.map((p) => p.player_id));
    const teamTp = team.counting.reduce((s, p) => s + (p.tp ?? 0), 0);
    lines.push('');
    lines.push(team.complete
      ? `${title.toUpperCase()}: ${team.total} (${formatToPar(teamTp)}) · best ${need} count`
      : `${title.toUpperCase()}: incomplete (needs ${need} scores)`);
    [...list].sort((a, b) => a.total - b.total).forEach((p, i) => {
      const thru = done(p) ? '' : ` (thru ${p.scores.length})`;
      const star = counting.has(p.player_id) ? '' : ' *';
      lines.push(`${i + 1}. ${p.full_name}  ${p.total} (${formatToPar(p.tp)})${thru}${star}`);
    });
  }
  if (medalists.length) {
    lines.push('');
    lines.push(`Low medalist: ${medalists.map((p) => p.full_name).join(' & ')}, ${lowScore} (${formatToPar(medalists[0].tp)})`);
  }
  if (teams.some(([, team, list]) => list.length > team.counting.length)) lines.push('* score did not count toward the team total');
  const text = lines.join('\n');

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: `${course} results`, text }); return; }
    } catch (e) {
      if (e?.name === 'AbortError') return; // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked: the text is on screen to copy by hand */ }
  }

  // ---------- printable sheet ----------
  function printSheet() {
    const holes = Array.from({ length: nHoles }, (_, i) => startHole + i);
    const head = `<tr><th class="l">Player</th>${holes.map((h) => `<th>${h}</th>`).join('')}<th>Tot</th><th>+/-</th></tr>`;
    const parRow = `<tr class="par"><td class="l">Par</td>${holes.map((h) => `<td>${result.par[h - 1] ?? ''}</td>`).join('')}<td>${parTotal}</td><td></td></tr>`;
    const body = teams.map(([title, team, list, need]) => {
      const counting = new Set(team.counting.map((p) => p.player_id));
      const teamTp = team.counting.reduce((s, p) => s + (p.tp ?? 0), 0);
      const rows = [...list].sort((a, b) => a.total - b.total).map((p) => {
        const byHole = Object.fromEntries(p.scores.map((s) => [s.hole_number, s.strokes]));
        const cls = counting.has(p.player_id) ? '' : ' class="drop"';
        return `<tr${cls}><td class="l">${esc(p.full_name)}${counting.has(p.player_id) ? '' : ' *'}</td>${holes.map((h) => {
          const s = byHole[h], par = result.par[h - 1];
          const c = s == null || par == null ? '' : s < par ? ' class="u"' : s > par + 1 ? ' class="o"' : '';
          return `<td${c}>${s ?? ''}</td>`;
        }).join('')}<td><b>${p.total}</b></td><td>${formatToPar(p.tp)}</td></tr>`;
      }).join('');
      return `<h2>${title}: ${team.complete ? `${team.total} (${formatToPar(teamTp)})` : 'incomplete'} <small>best ${need} count</small></h2>
        <table>${head}${parRow}${rows}</table>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(course)} results</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
        h1{font-size:20px;margin:0}.sub{color:#555;margin:2px 0 14px}
        h2{font-size:16px;margin:18px 0 6px}h2 small{font-weight:normal;color:#666}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #ccc;padding:3px 4px;text-align:center}
        th{background:#f2f2f2}.l{text-align:left;white-space:nowrap}
        tr.par td{background:#fafafa;color:#555}tr.drop td{color:#888}
        td.u{background:#d9f2df;font-weight:bold}td.o{background:#fde2e1}
        .med{margin-top:14px;font-size:14px}.note{color:#666;font-size:11px;margin-top:6px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>${esc(appName)}: ${round.type === 'match' ? 'Match results' : 'Round results'}</h1>
      <div class="sub">${esc(fmtDate(round.played_on))} · ${esc(course)}${parTotal ? ` (par ${parTotal})` : ''}</div>
      ${body}
      ${medalists.length ? `<div class="med"><b>Low medalist:</b> ${medalists.map((p) => esc(p.full_name)).join(' &amp; ')}, ${lowScore} (${formatToPar(medalists[0].tp)})</div>` : ''}
      <div class="note">* did not count toward the team total. Green = under par, red = double bogey or worse.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div className="card">
      <h2>Share results</h2>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'var(--green-100)', padding: 10, borderRadius: 10, margin: '0 0 10px' }}>
        {text}
      </pre>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1 }} onClick={share}>{copied ? 'Copied ✓' : 'Share / copy'}</button>
        <button className="secondary" style={{ flex: 1 }} onClick={printSheet}>Print / PDF</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        Share sends the text to Messages, email or social media. Print / PDF makes a full scorecard sheet
        (choose "Save as PDF" in the print screen).
      </p>
    </div>
  );
}
