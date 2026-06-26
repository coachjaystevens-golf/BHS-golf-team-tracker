// offlineQueue.js
// ----------------------------------------------------------
// A tiny, fail-safe queue for score saves that couldn't reach
// Supabase (e.g. a dead cell zone on the course). Saves are
// stored in localStorage and flushed when the connection
// returns. If anything here throws, callers fall back to
// normal behavior — a queue problem must never lose a score.
// ----------------------------------------------------------

import { supabase } from './supabase.js';

const KEY = 'bhsgolf_pending_scores_v1';

// Read the queue, tolerating any corruption (returns []).
function readQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

// How many saves are waiting to sync.
export function pendingCount() {
  return readQueue().length;
}

// Add one score to the queue. Returns true if queued.
// A score is keyed by round+player+hole so re-saving the same
// hole replaces the older queued version rather than duplicating.
export function enqueueScore(score) {
  try {
    const items = readQueue();
    const keyOf = (s) => `${s.round_id}|${s.player_id}|${s.hole_number}`;
    const k = keyOf(score);
    const next = items.filter((s) => keyOf(s) !== k);
    next.push({ ...score, _queuedAt: Date.now() });
    return writeQueue(next);
  } catch {
    return false;
  }
}

// Try to push everything in the queue to Supabase. Items that
// succeed are removed; items that fail stay for the next try.
// Returns { flushed, remaining }.
export async function flushQueue() {
  let items = readQueue();
  if (items.length === 0) return { flushed: 0, remaining: 0 };

  let flushed = 0;
  const stillPending = [];

  for (const score of items) {
    try {
      const { _queuedAt, ...row } = score;
      const { error } = await supabase
        .from('scores')
        .upsert(row, { onConflict: 'round_id,player_id,hole_number' });
      if (error) {
        stillPending.push(score); // keep for next attempt
      } else {
        flushed += 1;
      }
    } catch {
      stillPending.push(score);
    }
  }

  writeQueue(stillPending);
  return { flushed, remaining: stillPending.length };
}

// Register auto-flush when the browser regains connectivity.
// Returns an unsubscribe function. Safe to call once on mount.
export function onReconnect(callback) {
  const handler = async () => {
    try {
      const result = await flushQueue();
      if (callback) callback(result);
    } catch {
      // swallow — never throw from an event handler
    }
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

// Best-effort check of whether we're online right now.
export function isOnline() {
  try {
    return navigator.onLine !== false; // default true if unknown
  } catch {
    return true;
  }
}

// Attempt a single score upsert with a hard timeout, so a dead
// connection fails fast instead of hanging forever. Returns
// { ok: true } on success, or { ok: false, error } on failure
// or timeout — callers then queue the score.
export async function trySaveScore(row, timeoutMs = 6000) {
  try {
    const savePromise = supabase
      .from('scores')
      .upsert(row, { onConflict: 'round_id,player_id,hole_number' });

    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ error: { message: '__timeout__' } }), timeoutMs)
    );

    const result = await Promise.race([savePromise, timeout]);
    if (result?.error) return { ok: false, error: result.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}
