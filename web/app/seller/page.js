'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, auth, inr } from '../../lib/api';

const CATEGORIES = ['Pickles', 'Spices & Masalas', 'Tea & Coffee', 'Snacks', 'Honey & Oils'];
const FULFILMENT = ['NEW', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function SellerHub() {
  const [tab, setTab] = useState('products');
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p, o] = await Promise.all([api('/seller/summary'), api('/seller/products'), api('/seller/orders')]);
      setSummary(s);
      setProducts(p.products);
      setOrders(o.orders);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (auth.get()?.user?.role !== 'seller') return setError('Log in with a seller account to open the seller hub.');
    load();
  }, [load]);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  async function setStock(p, stock) {
    await api(`/seller/products/${p._id}/stock`, { method: 'PATCH', body: { stock } });
    flash(`Stock for ${p.title} set to ${stock}`);
    load();
  }
  async function setNew(p, isNewArrival) {
    await api(`/seller/products/${p._id}`, { method: 'PATCH', body: { isNewArrival } });
    flash(isNewArrival ? `${p.title} now shows as NEW` : `Removed NEW from ${p.title}`);
    load();
  }
  async function setStatus(o, status) {
    await api(`/seller/orders/${o.id}/status`, { method: 'PATCH', body: { status } });
    flash(`${o.orderNumber} marked ${status.toLowerCase()}`);
    load();
  }
  async function addProduct(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    try {
      await api('/seller/products', {
        method: 'POST',
        body: {
          title: f.title,
          description: f.description,
          category: f.category,
          packSize: f.packSize,
          price: Number(f.price),
          mrp: Number(f.mrp),
          stock: Number(f.stock),
          isNewArrival: f.isNewArrival === 'on',
          comingSoon: f.comingSoon === 'on',
        },
      });
      form.reset();
      flash('Product published to the storefront');
      setTab('products');
      load();
    } catch (err) {
      setError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    }
  }

  if (error && !summary) {
    return (
      <div className="wrap page">
        <h1>Seller hub</h1>
        <div className="empty">{error} <Link className="btn" href="/login">Log in</Link></div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <div className="row-between"><h1>{summary?.brandName ?? 'Seller hub'}</h1>{msg && <span className="status" role="status">{msg}</span>}</div>
      {summary && (
        <div className="tiles">
          <div className="tile"><div className="muted small">Live products</div><div className="v num">{summary.live}</div></div>
          <div className="tile"><div className="muted small">Low stock (5 or fewer)</div><div className="v num" style={{ color: summary.lowStock ? 'var(--warn)' : undefined }}>{summary.lowStock}</div></div>
          <div className="tile"><div className="muted small">Out of stock</div><div className="v num" style={{ color: summary.outOfStock ? 'var(--bad)' : undefined }}>{summary.outOfStock}</div></div>
          <div className="tile"><div className="muted small">Orders to fulfil</div><div className="v num">{summary.openOrders}</div></div>
        </div>
      )}
      <div className="tabs" role="tablist">
        {[['products', 'Products'], ['orders', 'Orders'], ['add', 'Add product']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === 'products' && (
        <div className="panel tablewrap">
          <table>
            <thead><tr><th>Product</th><th>Price</th><th>MRP</th><th>Stock</th><th>New arrival</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id}>
                  <td><strong>{p.title}</strong><div className="muted small">{p.category} · {p.packSize}{p.comingSoon ? ' · Coming soon' : ''}</div></td>
                  <td className="num">{inr(p.price)}</td>
                  <td className="num">{inr(p.mrp)}</td>
                  <td><input type="number" min={0} defaultValue={p.stock} aria-label={`Stock for ${p.title}`} onBlur={(e) => Number(e.target.value) !== p.stock && setStock(p, Math.max(0, parseInt(e.target.value, 10) || 0))} /></td>
                  <td><input type="checkbox" checked={p.isNewArrival} onChange={(e) => setNew(p, e.target.checked)} aria-label={`New arrival: ${p.title}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'orders' && (
        <div className="panel tablewrap">
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Your items</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={6}>No paid orders yet.</td></tr>}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="num"><strong>{o.orderNumber}</strong></td>
                  <td className="num">{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>{o.customer.name}<div className="muted small">{o.customer.city} {o.customer.pincode}</div></td>
                  <td>{o.items.map((i) => <div key={i.title}>{i.title} × {i.qty}</div>)}</td>
                  <td className="num">{inr(o.amount)}</td>
                  <td>
                    <select value={o.status} onChange={(e) => setStatus(o, e.target.value)} aria-label={`Status for ${o.orderNumber}`}>
                      {FULFILMENT.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'add' && (
        <form className="panel" style={{ maxWidth: 640 }} onSubmit={addProduct}>
          <label className="field">Product name<input name="title" required minLength={3} /></label>
          <label className="field">Description<textarea name="description" rows={3} /></label>
          <div className="two">
            <label className="field">Category<select name="category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field">Pack size<input name="packSize" placeholder="200 g" /></label>
          </div>
          <div className="two">
            <label className="field">Selling price (₹)<input name="price" type="number" min={1} step="0.01" required /></label>
            <label className="field">MRP (₹)<input name="mrp" type="number" min={1} step="0.01" required /></label>
          </div>
          <label className="field">Stock<input name="stock" type="number" min={0} required defaultValue={10} /></label>
          <label className="opt"><input type="checkbox" name="isNewArrival" defaultChecked /> Show as new arrival</label>
          <label className="opt"><input type="checkbox" name="comingSoon" /> Coming soon (visible, not yet for sale)</label>
          <button className="btn primary block">Publish product</button>
        </form>
      )}
    </div>
  );
}
