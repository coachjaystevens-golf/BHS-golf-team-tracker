import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

export default function JoinTeam() {
  const { refreshLink, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(''); setBusy(true);
    const { data, error } = await supabase.rpc('claim_player', {
      code: code.trim().toUpperCase(),
    });
    setBusy(false);

    if (error) { setError(error.message); return; }
    // success — refresh so the app knows we're now linked
    await refreshLink();
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">One last step</p>
        <h2>Enter your join code</h2>
        <p className="muted">
          Your coach gave you a 6-character code. Enter it to connect
          your account to your spot on the team.
        </p>

        {error && <div className="error">{error}</div>}

        <label htmlFor="code">Join code</label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7M2PQ"
          style={{ fontFamily: 'monospace', letterSpacing: '2px', fontSize: '20px' }}
          autoCapitalize="characters"
          autoCorrect="off"
        />

        <div className="spacer" />
        <button onClick={submit} disabled={busy || code.trim().length < 4}>
          {busy ? 'Linking…' : 'Join the team'}
        </button>

        <div className="spacer" />
        <button className="secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}