'use client';

import { useQueryState } from './useQueryState';

const PRICES = [
  { label: 'Any price', min: '', max: '' },
  { label: 'Under ₹100', min: '', max: '99' },
  { label: '₹100 – ₹200', min: '100', max: '200' },
  { label: 'Over ₹200', min: '201', max: '' },
];

export default function Filters({ facets }) {
  const { params, update } = useQueryState();
  const listParam = (k) => (params.get(k) ? params.get(k).split(',') : []);
  const toggleInList = (k, value) => {
    const set = new Set(listParam(k));
    set.has(value) ? set.delete(value) : set.add(value);
    update({ [k]: [...set].join(',') });
  };
  const flag = (k) => params.get(k) === '1';
  const price = PRICES.findIndex((p) => (params.get('minPrice') ?? '') === p.min && (params.get('maxPrice') ?? '') === p.max);

  return (
    <aside className="filters" aria-label="Filters">
      <details open>
        <summary className="btn" style={{ marginBottom: 8 }}>Filters</summary>
        <div className="fbody">
          <div className="fgroup">
            {[
              ['inStock', 'In stock only'],
              ['new', 'New arrivals'],
              ['comingSoon', 'Coming soon'],
            ].map(([k, label]) => (
              <label key={k} className="opt">
                <input type="checkbox" checked={flag(k)} onChange={(e) => update({ [k]: e.target.checked ? '1' : null })} /> {label}
              </label>
            ))}
          </div>

          <div className="fgroup">
            <h3>Category</h3>
            {(facets?.categories ?? []).map((c) => (
              <label key={c.name} className="opt">
                <input type="checkbox" checked={listParam('category').includes(c.name)} onChange={() => toggleInList('category', c.name)} />
                {c.name}
                <span className="n num">{c.count}</span>
              </label>
            ))}
          </div>

          <div className="fgroup">
            <h3>Brand</h3>
            {(facets?.brands ?? []).map((b) => (
              <label key={b.name} className="opt">
                <input type="checkbox" checked={listParam('brand').includes(b.name)} onChange={() => toggleInList('brand', b.name)} />
                {b.name}
                <span className="n num">{b.count}</span>
              </label>
            ))}
          </div>

          <div className="fgroup">
            <h3>Price</h3>
            {PRICES.map((p, i) => (
              <label key={p.label} className="opt">
                <input type="radio" name="price" checked={price === i || (price === -1 && i === 0)} onChange={() => update({ minPrice: p.min, maxPrice: p.max })} />
                {p.label}
              </label>
            ))}
          </div>

          <div className="fgroup">
            <h3>Customer rating</h3>
            {[['', 'Any rating'], ['4', '4★ & above'], ['4.5', '4.5★ & above']].map(([v, label]) => (
              <label key={label} className="opt">
                <input type="radio" name="rating" checked={(params.get('rating') ?? '') === v} onChange={() => update({ rating: v })} />
                {label}
              </label>
            ))}
          </div>

          <div className="fgroup">
            <h3>Discount</h3>
            {[['', 'Any'], ['10', '10% off or more'], ['15', '15% off or more'], ['20', '20% off or more']].map(([v, label]) => (
              <label key={label} className="opt">
                <input type="radio" name="discount" checked={(params.get('discount') ?? '') === v} onChange={() => update({ discount: v })} />
                {label}
              </label>
            ))}
          </div>

          <div className="fgroup">
            <button className="btn block" onClick={() => update({ inStock: null, new: null, comingSoon: null, category: null, brand: null, minPrice: null, maxPrice: null, rating: null, discount: null, q: null })}>
              Clear all filters
            </button>
          </div>
        </div>
      </details>
    </aside>
  );
}
