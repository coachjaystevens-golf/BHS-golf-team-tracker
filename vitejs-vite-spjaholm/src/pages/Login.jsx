import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(''); setNotice(''); setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);

    if (error) { setError(error.message); return; }
    if (mode === 'signup') {
      setNotice('Account created. You can sign in now.');
      setMode('signin');
    }
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Golf Team Tracker</p>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>

        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}

        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" inputMode="email"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />

        <div className="spacer" />
        <button onClick={handleSubmit} disabled={busy || !email || !password}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <div className="spacer" />
        <button
          className="secondary"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </div>

      <p className="muted center">
        Players: sign up, then your coach links you to the roster.
      </p>
    </div>
  );
}