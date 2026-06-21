import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(''); setNotice(''); setBusy(true);

    if (mode === 'forgot') {
      const { error } = await requestPasswordReset(email.trim());
      setBusy(false);
      if (error) { setError(error.message); return; }
      setNotice('If that email is registered, a reset link is on its way. Check your inbox (and spam).');
      return;
    }

    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (mode === 'signup') {
      setNotice('Account created. You can sign in now.');
      setMode('signin');
    }
  }

  const title =
    mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Create your account'
    : 'Reset your password';

  const buttonLabel =
    busy ? 'Working…'
    : mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Sign up'
    : 'Send reset link';

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Golf Team Tracker</p>
        <h2>{title}</h2>

        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}

        {mode === 'forgot' && (
          <p className="muted" style={{ marginBottom: 6 }}>
            Enter your email and we'll send you a link to set a new password.
          </p>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" inputMode="email"
        />

        {mode !== 'forgot' && (
          <>
            <label htmlFor="password">Password</label>
            <input
              id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </>
        )}

        <div className="spacer" />
        <button
          onClick={handleSubmit}
          disabled={busy || !email || (mode !== 'forgot' && !password)}
        >
          {buttonLabel}
        </button>

        {mode === 'signin' && (
          <>
            <div className="spacer" />
            <button
              className="secondary"
              onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}
            >
              Forgot password?
            </button>
          </>
        )}

        <div className="spacer" />
        <button
          className="secondary"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(''); setNotice('');
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up'
            : mode === 'signup' ? 'Have an account? Sign in'
            : 'Back to sign in'}
        </button>
      </div>

      <p className="muted center">
        Players: sign up, then your coach links you to the roster.
      </p>
    </div>
  );
}
