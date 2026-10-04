'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth } from '../../lib/api';

const MODES = [
  ['login', 'Log in'],
  ['customer', 'Create customer account'],
  ['seller', 'Sell on Kadai'],
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const path = { login: '/auth/login', customer: '/auth/register', seller: '/auth/register-seller' }[mode];
    if (!body.phone) delete body.phone;
    if (!body.gstin) delete body.gstin;
    try {
      const session = await api(path, { method: 'POST', body });
      auth.set(session);
      router.push(session.user.role === 'seller' ? '/seller' : '/');
    } catch (err) {
      setError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap page" style={{ maxWidth: 520 }}>
      <h1>{mode === 'seller' ? 'Register your brand' : 'Welcome to Kadai'}</h1>
      <div className="tabs" role="tablist">
        {MODES.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setError(''); }}>{label}</button>
        ))}
      </div>
      <form className="panel" onSubmit={submit} key={mode}>
        {mode !== 'login' && <label className="field">Your name<input name="name" required minLength={2} /></label>}
        <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
        {mode !== 'login' && (
          <label className="field">Mobile number<input name="phone" inputMode="numeric" pattern="[6-9][0-9]{9}" required={mode === 'seller'} /></label>
        )}
        {mode === 'seller' && (
          <>
            <div className="two">
              <label className="field">Brand name<input name="brandName" required /></label>
              <label className="field">City<input name="city" required /></label>
            </div>
            <label className="field">GSTIN (optional)<input name="gstin" maxLength={15} /></label>
          </>
        )}
        <label className="field">Password<input name="password" type="password" required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'seller' && <span className="muted small">An admin reviews new brands before their products go live.</span>}
        {mode === 'login' && <span className="muted small">Sample accounts after seeding: asha@kadai.dev (customer), kuttanad@kadai.dev (seller). Password: password123</span>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : MODES.find(([k]) => k === mode)[1]}</button>
      </form>
    </div>
  );
}
