import { api } from '../lib/api';
import Filters from '../components/Filters';
import SortSelect from '../components/SortSelect';
import ProductCard from '../components/ProductCard';
import Pagination from '../components/Pagination';

export const dynamic = 'force-dynamic';

const PASS_THROUGH = ['q', 'category', 'brand', 'inStock', 'new', 'minPrice', 'maxPrice', 'rating', 'discount', 'comingSoon', 'sort', 'page'];

export default async function Home({ searchParams }) {
  const qs = new URLSearchParams();
  for (const k of PASS_THROUGH) if (searchParams[k]) qs.set(k, searchParams[k]);

  let data;
  let error;
  try {
    data = await api(`/products?${qs}`);
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="wrap">
      <section className="hero">
        <h1>Pickles, spices and tea from Kerala&apos;s home kitchens</h1>
        <p className="muted">Local brands, packed to order. Free delivery on orders above ₹499.</p>
      </section>
      <div className="shop">
        <Filters facets={data?.facets} />
        <section>
          <div className="toolbar">
            <strong className="num">{data ? `${data.total} products` : ''}</strong>
            <SortSelect />
          </div>
          {error && <div className="empty">The shop could not load products ({error}). Is the API running on port 4000?</div>}
          {data && data.items.length === 0 && <div className="empty">No products match these filters. Try removing one.</div>}
          {data && data.items.length > 0 && (
            <>
              <div className="grid">{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              <Pagination page={data.page} pages={data.pages} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
