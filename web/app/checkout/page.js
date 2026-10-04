'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, auth, cart, inr } from '../../lib/api';

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(s);
  });
}

export default function CheckoutPage() {
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setLines(cart.get());
    setUser(auth.get()?.user ?? null);
  }, []);

  async function pay(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { order, payment } = await api('/orders/checkout', {
        method: 'POST',
        body: {
          contact: { name: f.name, email: f.email, phone: f.phone },
          address: { line1: f.line1, city: f.city, state: f.state, pincode: f.pincode },
          items: lines.map((l) => ({ productId: l.id, qty: l.qty })),
        },
      });

      const verify = (r) =>
        api('/payments/verify', {
          method: 'POST',
          body: { razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature ?? '' },
        });

      if (payment.mock) {
        // Local development without Razorpay keys: the API accepts mock payments
        await verify({ razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: `pay_mock_${Date.now()}` });
        cart.clear();
        setDone(order);
        return;
      }

      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        name: 'Kadai Market',
        description: `Order ${order.orderNumber}`,
        prefill: payment.prefill,
        theme: { color: '#1d5a38' },
        handler: async (response) => {
          try {
            await verify(response);
            cart.clear();
            setDone(order);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => { setBusy(false); setError('Payment was cancelled. Your items are held for 15 minutes.'); } },
      });
      rzp.on('payment.failed', (r) => setError(r.error?.description || 'Payment failed. Try another method.'));
      rzp.open();
    } catch (err) {
      setError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="wrap page" style={{ maxWidth: 560 }}>
        <div className="panel" style={{ textAlign: 'center' }}>
          <h1>Order placed</h1>
          <p>Your order <strong className="num">{done.orderNumber}</strong> is confirmed. Keep this ID to track it.</p>
          <Link className="btn primary" href={user ? '/orders' : '/track'}>{user ? 'View my orders' : 'Track this order'}</Link>
        </div>
      </div>
    );
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const total = subtotal + (subtotal >= 499 ? 0 : 40);

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <h1>Checkout</h1>
      {!lines.length ? (
        <div className="empty">Your cart is empty. <Link className="btn" href="/">Browse products</Link></div>
      ) : (
        <form className="panel" onSubmit={pay}>
          {!user && <span className="muted small">Checking out as a guest. <Link href="/login" style={{ textDecoration: 'underline' }}>Log in</Link> to see this order in your history.</span>}
          <div className="two">
            <label className="field">Full name<input name="name" required defaultValue={user?.name ?? ''} /></label>
            <label className="field">Mobile number<input name="phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" defaultValue={user?.phone ?? ''} /></label>
          </div>
          <label className="field">Email<input name="email" type="email" required defaultValue={user?.email ?? ''} /></label>
          <label className="field">House, street, area<input name="line1" required /></label>
          <div className="two">
            <label className="field">City<input name="city" required /></label>
            <label className="field">PIN code<input name="pincode" required inputMode="numeric" pattern="[0-9]{6}" /></label>
          </div>
          <label className="field">State<input name="state" required defaultValue="Kerala" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Opening payment…' : `Pay ${inr(total)}`}</button>
          <span className="muted small">UPI, cards, netbanking and wallets through Razorpay.</span>
        </form>
      )}
    </div>
  );
}
