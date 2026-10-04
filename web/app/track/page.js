'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import OrderCard from '../../components/OrderCard';

export default function TrackPage() {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setOrder(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      setOrder((await api('/orders/track', { method: 'POST', body })).order);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <h1>Track your order</h1>
      <form className="panel" onSubmit={submit}>
        <div className="two">
          <label className="field">Order ID<input name="orderNumber" required placeholder="KM-261003-4F9A2C" /></label>
          <label className="field">Mobile number<input name="phone" required inputMode="numeric" /></label>
        </div>
        <span className="muted small">Your Order ID is in your confirmation email.</span>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block">Track order</button>
      </form>
      {order && <OrderCard order={order} />}
    </div>
  );
}
