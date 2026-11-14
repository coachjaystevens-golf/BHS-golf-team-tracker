// ---- InstallHint: "add this app to your home screen" tip ----
//
// Shown in the phone's browser (iPhone Safari or Android Chrome) until the
// person installs the app or taps "Not now". Never shown once the app is
// opened from the home screen, or on a computer.

import { useState } from 'react';

const DISMISS_KEY = 'bhsgolf_install_hint_dismissed_v1';

function detect() {
  if (typeof window === 'undefined') return null;
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone) return null;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || iPadOS) {
    // Only Safari can add to the home screen on older iPhones; Chrome on iOS 16.4+ can too
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return null;
}

function isDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export default function InstallHint({ beforeLogin = false }) {
  const [platform] = useState(detect);
  const [hidden, setHidden] = useState(isDismissed);
  if (!platform || hidden) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setHidden(true);
  }

  return (
    <div className="card" style={{ margin: '12px 18px 0', background: 'var(--green-100)', border: '1.5px solid var(--green-500)' }}>
      <p className="eyebrow" style={{ marginBottom: 4 }}>📲 Get the app</p>
      {platform === 'ios' ? (
        <p style={{ fontSize: 14, margin: 0 }}>
          Tap the <strong>Share</strong> button (the square with an arrow), then{' '}
          <strong>Add to Home Screen</strong>. It opens full-screen like a regular app.
        </p>
      ) : (
        <p style={{ fontSize: 14, margin: 0 }}>
          Tap the <strong>⋮ menu</strong>, then <strong>Add to Home screen</strong> (or{' '}
          <strong>Install app</strong>). It opens full-screen like a regular app.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 8 }}>
        {beforeLogin
          ? 'Tip: add it first, then sign in from the home-screen icon.'
          : "You'll sign in once more the first time you open it from the home screen."}
      </p>
      <button className="secondary" style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }} onClick={dismiss}>
        Not now
      </button>
    </div>
  );
}
