import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, inr } from '../../../lib/api';
import AddToCart from '../../../components/AddToCart';

export const dynamic = 'force-dynamic';

async function load(slug) {
  try {
    return (await api(`/products/${encodeURIComponent(slug)}`)).product;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }) {
  const p = await load(params.slug);
  return p ? { title: p.title, description: `${p.title} by ${p.brandName}, ${p.packSize}` } : {};
}

export default async function ProductPage({ params }) {
  const p = await load(params.slug);
  if (!p) notFound();
  return (
    <div className="wrap page" style={{ maxWidth: 980 }}>
      <Link href="/" className="muted small">← Back to shop</Link>
      <div className="two" style={{ gap: 24, alignItems: 'start' }}>
        <div className="card"><div className="art" style={{ fontSize: 72 }}>{p.title.charAt(0)}</div></div>
        <div className="panel">
          <span className="muted small">{p.brandName} · {p.category}</span>
          <h1 style={{ fontSize: 28 }}>{p.title}</h1>
          {p.reviewCount > 0 && <span className="muted num">★ {p.rating.toFixed(1)} · {p.reviewCount} ratings</span>}
          <div className="price num">
            <b>{inr(p.price)}</b>
            {p.mrp > p.price && (<><s>{inr(p.mrp)}</s><span className="off">{p.discountPct}% off</span></>)}
          </div>
          <span className="muted">Pack size: {p.packSize}</span>
          {p.lowStock && <span className="low">Only {p.lowStock} left</span>}
          <p>{p.description}</p>
          <AddToCart product={p} />
        </div>
      </div>
    </div>
  );
}
