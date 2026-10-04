'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cart, inr } from '../../lib/api';

export default function CartPage() {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    const sync = () => setLines(cart.get());
    sync();
    window.addEventListener('cart-change', sync);
    return () => window.removeEventListener('cart-change', sync);
  }, []);

  // Display estimate only; the API recalculates every price and fee at checkout
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal === 0 || subtotal >= 499 ? 0 : 40;

  if (!lines.length) {
    return (
      <div className="wrap page">
        <h1>Your cart</h1>
        <div className="empty">Your cart is empty. <Link className="btn" href="/">Browse products</Link></div>
      </div>
    );
  }

  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <h1>Your cart</h1>
      <div className="panel">
        {lines.map((l) => (
          <div key={l.id} className="line">
            <div>
              <Link href={`/product/${l.slug}`}><strong>{l.title}</strong></Link>
              <div className="muted small">{l.brandName} · {l.packSize}</div>
            </div>
            <select aria-label={`Quantity of ${l.title}`} value={l.qty} onChange={(e) => cart.setQty(l.id, Number(e.target.value))}>
              <option value={0}>Remove</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="num">{inr(l.price * l.qty)}</span>
          </div>
        ))}
        <div className="row-between num"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
        <div className="row-between num"><span>Delivery</span><span>{shipping ? inr(shipping) : 'Free'}</span></div>
        {subtotal < 499 && <span className="muted small">Add {inr(499 - subtotal)} more for free delivery.</span>}
        <div className="row-between num" style={{ fontWeight: 700, fontSize: 17 }}><span>Total</span><span>{inr(subtotal + shipping)}</span></div>
        <Link className="btn primary block" href="/checkout">Checkout</Link>
      </div>
    </div>
  );
}
