import Link from 'next/link';
import AddToCart from './AddToCart';
import { inr } from '../lib/api';

export default function ProductCard({ p }) {
  return (
    <article className="card">
      <Link href={`/product/${p.slug}`} className="art" aria-label={p.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt="" /> : p.title.charAt(0)}
        <span className="badges">
          {p.comingSoon && <span className="badge b-new">COMING SOON</span>}
          {!p.comingSoon && p.isNew && <span className="badge b-new">NEW</span>}
          {p.discountPct >= 5 && <span className="badge b-off">{p.discountPct}% OFF</span>}
          {!p.comingSoon && !p.inStock && <span className="badge b-out">OUT OF STOCK</span>}
        </span>
      </Link>
      <div className="body">
        <span className="muted small">{p.brandName}</span>
        <Link href={`/product/${p.slug}`} className="title">{p.title}</Link>
        <span className="muted small num">
          {p.packSize}
          {p.reviewCount > 0 && ` · ★ ${p.rating.toFixed(1)} (${p.reviewCount})`}
        </span>
        {p.lowStock && <span className="low">Only {p.lowStock} left</span>}
        {!p.inStock && !p.comingSoon && <span className="out">Out of stock</span>}
        <div className="price num">
          <b>{inr(p.price)}</b>
          {p.mrp > p.price && (
            <>
              <s>{inr(p.mrp)}</s>
              <span className="off">{p.discountPct}% off</span>
            </>
          )}
        </div>
      </div>
      <div className="actions">
        <AddToCart product={p} />
      </div>
    </article>
  );
}
