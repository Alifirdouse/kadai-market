// Small API client shared by server and client components.
const BROWSER_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SERVER_API = process.env.API_URL || BROWSER_API;
const base = () => (typeof window === 'undefined' ? SERVER_API : BROWSER_API);

const AUTH_KEY = 'kadai-auth';
const CART_KEY = 'kadai-cart';

function read(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const auth = {
  get: () => read(AUTH_KEY, null),
  set: (session) => {
    write(AUTH_KEY, session);
    window.dispatchEvent(new Event('auth-change'));
  },
  clear: () => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {}
    window.dispatchEvent(new Event('auth-change'));
  },
};

export async function api(path, { method = 'GET', body, cache = 'no-store', retry = true } = {}) {
  const session = auth.get();
  const res = await fetch(`${base()}/api/v1${path}`, {
    method,
    cache,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Access tokens last 15 minutes: refresh once, then retry the request
  if (res.status === 401 && retry && session?.refreshToken) {
    const r = await fetch(`${base()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (r.ok) {
      auth.set(await r.json());
      return api(path, { method, body, cache, retry: false });
    }
    auth.clear();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.details = data.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Cart lives in the browser for guests and customers alike; the server re-prices it at checkout.
export const cart = {
  get: () => read(CART_KEY, []),
  save(lines) {
    write(CART_KEY, lines);
    window.dispatchEvent(new Event('cart-change'));
  },
  add(product, qty = 1) {
    const lines = cart.get();
    const line = lines.find((l) => l.id === product.id);
    if (line) line.qty = Math.min(20, line.qty + qty);
    else
      lines.push({ id: product.id, slug: product.slug, title: product.title, packSize: product.packSize, brandName: product.brandName, price: product.price, mrp: product.mrp, qty });
    cart.save(lines);
  },
  setQty(id, qty) {
    cart.save(cart.get().map((l) => (l.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0));
  },
  clear: () => cart.save([]),
  count: () => cart.get().reduce((n, l) => n + l.qty, 0),
};

export const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
