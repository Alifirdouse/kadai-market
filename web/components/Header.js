'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, cart } from '../lib/api';

export default function Header() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = useState(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSession(auth.get());
      setCount(cart.count());
    };
    sync();
    window.addEventListener('auth-change', sync);
    window.addEventListener('cart-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auth-change', sync);
      window.removeEventListener('cart-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const role = session?.user?.role;

  function onSearch(e) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q')?.toString().trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : '/');
  }

  return (
    <header className="top">
      <div className="wrap row">
        <Link href="/" className="logo"><span>K</span>Kadai</Link>
        <form className="search" role="search" onSubmit={onSearch}>
          <input name="q" type="search" defaultValue={params.get('q') ?? ''} placeholder="Search pickles, spices, tea…" aria-label="Search products" />
          <button type="submit">Search</button>
        </form>
        <nav className="nav">
          <Link className="btn ghost" href="/track">Track order</Link>
          {role === 'customer' && <Link className="btn ghost" href="/orders">My orders</Link>}
          {role === 'seller' && <Link className="btn ghost" href="/seller">Seller hub</Link>}
          {session ? (
            <button className="btn ghost" onClick={() => { auth.clear(); router.push('/'); }}>Log out</button>
          ) : (
            <Link className="btn ghost" href="/login">Log in</Link>
          )}
          {role !== 'seller' && (
            <Link className="btn primary" href="/cart" aria-label={`Cart, ${count} items`}>
              Cart <span className="count num">{count}</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
