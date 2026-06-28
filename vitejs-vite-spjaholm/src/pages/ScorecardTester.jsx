import React, { useState, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Scorecard Extraction Tester
// Upload a real scorecard photo → live vision call → review & correct the read.
// This is a standalone test harness. The extraction logic (prompt + parse + the
// review-screen shape) is what ports into BHS-Golf; the styling here is throwaway.
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are reading a photographed golf scorecard. Return ONLY a JSON object, no preamble, no markdown.

STEP 1 — IDENTIFY THE CARD TYPE.
- If the card has clearly labeled rows in this order: "Opp Name", "Opp Score", "Your Score", "Putts", "F", "G" — set card_type to "bhs_stat_card".
- Otherwise set card_type to "generic_card".

STEP 2 — FIND THE ANCHORS.
- Locate the row of hole numbers (1 through 18, possibly with Out/In/Tot columns). Ignore Out/In/Tot when listing per-hole data.
- Locate the par row if present.

STEP 3 — EXTRACT PER HOLE (holes 1–18 in order).
For each hole report:
  - "hole": integer 1–18
  - "par": integer, or null if you cannot read it
  - "score": the player's strokes for that hole as an integer, or null if illegible/blank
  - "putts": integer. If putts are written as TALLY MARKS, count the vertical strokes; a diagonal line through four marks means five. null if not present.
  - "fairway": true if marked "F" (fairway hit), false if explicitly marked missed, "na" for par 3s, null if no fairway data on the card
  - "gir": true if marked "G" (green in regulation), false if explicitly missed, null if no GIR data on the card
  - "opp_score": the opponent's strokes for that hole as an integer, or null if not present

RULES:
- Do NOT guess. If a cell is blank, smudged, or ambiguous, use null. A null is better than a wrong number.
- For a generic_card, putts/fairway/gir are usually absent — return null for those, that is expected and correct.
- Set "confidence" to "high", "medium", or "low" for the overall read.
- Put anything unusual (glare, fold, cut-off holes, only 9 holes visible) in "notes".

OUTPUT SHAPE:
{
  "card_type": "bhs_stat_card" | "generic_card",
  "confidence": "high" | "medium" | "low",
  "holes": [
    { "hole": 1, "par": 4, "score": 5, "putts": 2, "fairway": true, "gir": false, "opp_score": 4 }
  ],
  "notes": "string"
}`;

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

const BLANK_HOLE = (n) => ({
  hole: n,
  par: null,
  score: null,
  putts: null,
  fairway: null,
  gir: null,
  opp_score: null,
});

export default function ScorecardTester() {
  const [status, setStatus] = useState("idle"); // idle | reading | review | error
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [holes, setHoles] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setStatus("reading");
    setErrorMsg("");
    setResult(null);
    const t0 = performance.now();

    try {
      const base64 = await fileToBase64(file);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: file.type || "image/jpeg",
                    data: base64,
                  },
                },
                { type: "text", text: EXTRACTION_PROMPT },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const raw = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
      setResult(parsed);

      // Normalize to a full 18-hole array so the review grid is always complete.
      const byHole = {};
      (parsed.holes || []).forEach((h) => {
        if (h.hole >= 1 && h.hole <= 18) byHole[h.hole] = h;
      });
      const full = [];
      for (let i = 1; i <= 18; i++) full.push(byHole[i] || BLANK_HOLE(i));
      setHoles(full);
      setStatus("review");
    } catch (err) {
      console.error(err);
      setErrorMsg(
        "Couldn't read that image. Try a flatter, brighter photo taken straight-on."
      );
      setStatus("error");
    }
  }

  function updateHole(idx, field, value) {
    setHoles((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setResult(null);
    setHoles([]);
    setErrorMsg("");
    setElapsed(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Derived stats from the (corrected) review data ──
  const totals = holes.reduce(
    (acc, h) => {
      if (typeof h.score === "number") acc.score += h.score;
      if (typeof h.putts === "number") acc.putts += h.putts;
      if (h.fairway === true) acc.fairways += 1;
      if (h.gir === true) acc.girs += 1;
      if (typeof h.opp_score === "number") acc.opp += h.opp_score;
      return acc;
    },
    { score: 0, putts: 0, fairways: 0, girs: 0, opp: 0 }
  );

  const cardLabel =
    result?.card_type === "bhs_stat_card"
      ? "BHS stat card"
      : result?.card_type === "generic_card"
      ? "Generic course card"
      : "—";

  const confColor =
    result?.confidence === "high"
      ? "#1d9e75"
      : result?.confidence === "medium"
      ? "#ba7517"
      : "#e24b4a";

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <h1 style={S.h1}>Scorecard read tester</h1>
        <p style={S.sub}>
          Upload a real scorecard photo. The model detects the card type, pulls
          per-hole data, and hands you a review grid to correct before anything
          would be saved.
        </p>
      </div>

      {status === "idle" && (
        <div style={S.dropzone} onClick={() => fileRef.current?.click()}>
          <div style={S.dropIcon}>📷</div>
          <p style={S.dropTitle}>Choose a scorecard photo</p>
          <p style={S.dropHint}>
            Flat, bright, straight-on reads best. JPG or PNG.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      {status === "reading" && (
        <div style={S.center}>
          {preview && <img src={preview} alt="" style={S.previewImg} />}
          <div style={S.spinner} />
          <p style={S.readingText}>Reading the card…</p>
        </div>
      )}

      {status === "error" && (
        <div style={S.center}>
          <div style={S.errorBox}>{errorMsg}</div>
          <button style={S.btn} onClick={reset}>
            Try another photo
          </button>
        </div>
      )}

      {status === "review" && result && (
        <div>
          <div style={S.metaRow}>
            <div style={S.metaCard}>
              <span style={S.metaLabel}>Card type</span>
              <span style={S.metaVal}>{cardLabel}</span>
            </div>
            <div style={S.metaCard}>
              <span style={S.metaLabel}>Confidence</span>
              <span style={{ ...S.metaVal, color: confColor }}>
                {result.confidence || "—"}
              </span>
            </div>
            <div style={S.metaCard}>
              <span style={S.metaLabel}>Read time</span>
              <span style={S.metaVal}>{elapsed ? `${elapsed}s` : "—"}</span>
            </div>
          </div>

          {(result.confidence === "low" || result.notes) && (
            <div style={S.notesBanner}>
              <strong>Heads up:</strong>{" "}
              {result.notes || "Low confidence — double-check every cell."}
            </div>
          )}

          <p style={S.reviewHint}>
            Empty cells are highlighted. Tap any value to fix it. Nothing here
            would save until you confirm.
          </p>

          <div style={S.tableScroll}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.thLabel}>Hole</th>
                  {holes.map((h) => (
                    <th key={h.hole} style={S.th}>
                      {h.hole}
                    </th>
                  ))}
                  <th style={S.thTot}>Tot</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Par"
                  field="par"
                  holes={holes}
                  update={updateHole}
                  total=""
                />
                <Row
                  label="Score"
                  field="score"
                  holes={holes}
                  update={updateHole}
                  total={totals.score || ""}
                  emphasize
                />
                <Row
                  label="Putts"
                  field="putts"
                  holes={holes}
                  update={updateHole}
                  total={totals.putts || ""}
                />
                <BoolRow
                  label="Fairway"
                  field="fairway"
                  holes={holes}
                  update={updateHole}
                  total={totals.fairways || ""}
                />
                <BoolRow
                  label="GIR"
                  field="gir"
                  holes={holes}
                  update={updateHole}
                  total={totals.girs || ""}
                />
                <Row
                  label="Opp score"
                  field="opp_score"
                  holes={holes}
                  update={updateHole}
                  total={totals.opp || ""}
                />
              </tbody>
            </table>
          </div>

          <div style={S.actions}>
            <button style={S.btnGhost} onClick={reset}>
              Start over
            </button>
            <button
              style={S.btn}
              onClick={() =>
                alert(
                  "In BHS-Golf this is where the confirmed round writes to Supabase."
                )
              }
            >
              Confirm round
            </button>
          </div>

          <details style={S.raw}>
            <summary style={S.rawSummary}>View raw JSON the model returned</summary>
            <pre style={S.pre}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function Row({ label, field, holes, update, total, emphasize }) {
  return (
    <tr>
      <td style={{ ...S.rowLabel, ...(emphasize ? { fontWeight: 700 } : {}) }}>
        {label}
      </td>
      {holes.map((h, idx) => {
        const val = h[field];
        const empty = val === null || val === undefined || val === "";
        return (
          <td key={idx} style={S.cell}>
            <input
              value={empty ? "" : val}
              onChange={(e) => {
                const v = e.target.value;
                update(idx, field, v === "" ? null : Number(v));
              }}
              style={{
                ...S.cellInput,
                ...(empty ? S.cellEmpty : {}),
                ...(emphasize ? { fontWeight: 700 } : {}),
              }}
              inputMode="numeric"
            />
          </td>
        );
      })}
      <td style={S.cellTot}>{total}</td>
    </tr>
  );
}

function BoolRow({ label, field, holes, update, total }) {
  // Cycle: null → true (✓) → false (✗) → "na" → null
  const next = (v) =>
    v === null ? true : v === true ? false : v === false ? "na" : null;
  const glyph = (v) =>
    v === true ? "✓" : v === false ? "✗" : v === "na" ? "–" : "";
  const color = (v) =>
    v === true ? "#1d9e75" : v === false ? "#e24b4a" : "#888780";
  return (
    <tr>
      <td style={S.rowLabel}>{label}</td>
      {holes.map((h, idx) => {
        const v = h[field];
        const empty = v === null || v === undefined;
        return (
          <td key={idx} style={S.cell}>
            <button
              onClick={() => update(idx, field, next(v))}
              style={{
                ...S.boolBtn,
                ...(empty ? S.cellEmpty : {}),
                color: color(v),
              }}
              title="Tap to cycle: hit / miss / N/A / blank"
            >
              {glyph(v)}
            </button>
          </td>
        );
      })}
      <td style={S.cellTot}>{total}</td>
    </tr>
  );
}

const S = {
  wrap: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 20px 60px",
    color: "#2c2c2a",
  },
  header: { marginBottom: 24 },
  h1: { fontSize: 24, fontWeight: 700, margin: "0 0 6px" },
  sub: { fontSize: 15, color: "#5f5e5a", margin: 0, lineHeight: 1.5, maxWidth: 620 },
  dropzone: {
    border: "2px dashed #b4b2a9",
    borderRadius: 14,
    padding: "48px 24px",
    textAlign: "center",
    cursor: "pointer",
    background: "#faf9f5",
    transition: "border-color .15s",
  },
  dropIcon: { fontSize: 34, marginBottom: 10 },
  dropTitle: { fontSize: 16, fontWeight: 600, margin: "0 0 4px" },
  dropHint: { fontSize: 13, color: "#888780", margin: 0 },
  center: { textAlign: "center", padding: "20px 0" },
  previewImg: {
    maxWidth: "100%",
    maxHeight: 280,
    borderRadius: 10,
    border: "1px solid #d3d1c7",
    marginBottom: 18,
  },
  spinner: {
    width: 28,
    height: 28,
    border: "3px solid #d3d1c7",
    borderTopColor: "#534ab7",
    borderRadius: "50%",
    margin: "0 auto 10px",
    animation: "spin 0.8s linear infinite",
  },
  readingText: { fontSize: 14, color: "#5f5e5a", margin: 0 },
  errorBox: {
    background: "#fcebeb",
    color: "#a32d2d",
    padding: "14px 18px",
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 16,
    maxWidth: 420,
    margin: "0 auto 16px",
  },
  metaRow: { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  metaCard: {
    background: "#f1efe8",
    borderRadius: 10,
    padding: "10px 16px",
    display: "flex",
    flexDirection: "column",
    minWidth: 120,
  },
  metaLabel: { fontSize: 12, color: "#888780", marginBottom: 2 },
  metaVal: { fontSize: 18, fontWeight: 600, textTransform: "capitalize" },
  notesBanner: {
    background: "#faeeda",
    color: "#854f0b",
    padding: "12px 16px",
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  reviewHint: { fontSize: 13, color: "#5f5e5a", margin: "0 0 12px" },
  tableScroll: { overflowX: "auto", paddingBottom: 6 },
  table: { borderCollapse: "collapse", width: "100%", minWidth: 760 },
  th: {
    fontSize: 12,
    fontWeight: 600,
    color: "#5f5e5a",
    padding: "6px 0",
    textAlign: "center",
    minWidth: 38,
  },
  thLabel: { fontSize: 12, fontWeight: 600, color: "#5f5e5a", textAlign: "left", paddingRight: 10 },
  thTot: { fontSize: 12, fontWeight: 700, color: "#2c2c2a", textAlign: "center", paddingLeft: 6 },
  rowLabel: {
    fontSize: 13,
    color: "#2c2c2a",
    paddingRight: 10,
    whiteSpace: "nowrap",
    fontWeight: 500,
  },
  cell: { padding: 2, textAlign: "center" },
  cellInput: {
    width: 34,
    height: 32,
    textAlign: "center",
    border: "1px solid #d3d1c7",
    borderRadius: 6,
    fontSize: 14,
    color: "#2c2c2a",
    background: "#fff",
    outline: "none",
  },
  cellEmpty: { background: "#faeeda", borderColor: "#ef9f27" },
  boolBtn: {
    width: 34,
    height: 32,
    border: "1px solid #d3d1c7",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 700,
    background: "#fff",
    cursor: "pointer",
  },
  cellTot: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    paddingLeft: 6,
    color: "#2c2c2a",
  },
  actions: { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" },
  btn: {
    background: "#534ab7",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    background: "#fff",
    color: "#5f5e5a",
    border: "1px solid #d3d1c7",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  raw: { marginTop: 24 },
  rawSummary: { fontSize: 13, color: "#888780", cursor: "pointer" },
  pre: {
    background: "#2c2c2a",
    color: "#e1f5ee",
    padding: 16,
    borderRadius: 10,
    fontSize: 12,
    overflowX: "auto",
    marginTop: 10,
    lineHeight: 1.5,
  },
};

if (typeof document !== "undefined" && !document.getElementById("sc-spin")) {
  const st = document.createElement("style");
  st.id = "sc-spin";
  st.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(st);
}
