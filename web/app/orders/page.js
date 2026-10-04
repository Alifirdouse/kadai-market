'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, auth } from '../../lib/api';
import OrderCard from '../../components/OrderCard';

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.get()) return setError('login');
    api('/orders').then((d) => setOrders(d.orders)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <h1>My orders</h1>
      {error === 'login' && <div className="empty">Log in to see your orders. <Link className="btn" href="/login">Log in</Link></div>}
      {error && error !== 'login' && <p className="error">{error}</p>}
      {orders?.length === 0 && <div className="empty">No orders yet. <Link className="btn" href="/">Start shopping</Link></div>}
      {orders?.map((o) => <OrderCard key={o.id} order={o} />)}
    </div>
  );
}
