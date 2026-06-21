import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function ResetPassword() {
  const { updatePassword, clearRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    clearRecovery();
  }

  if (done) {
    return (
      <div className="content">
        <div className="card">
          <h2>Password updated</h2>
          <div className="success">Your new password is set.</div>
          <p className="muted">You're signed in. You can start using the app.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Golf Team Tracker</p>
        <h2>Set a new password</h2>
        {error && <div className="error">{error}</div>}

        <label htmlFor="newpw">New password</label>
        <input
          id="newpw" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        <label htmlFor="confirmpw">Confirm new password</label>
        <input
          id="confirmpw" type="password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />

        <div className="spacer" />
        <button onClick={submit} disabled={busy || !password || !confirm}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>

        <div className="spacer" />
        <button className="secondary" onClick={() => { clearRecovery(); signOut(); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
