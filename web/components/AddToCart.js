'use client';

import { useState } from 'react';
import { cart } from '../lib/api';

export default function AddToCart({ product }) {
  const [added, setAdded] = useState(false);
  if (product.comingSoon) return <button className="btn block" disabled>Coming soon</button>;
  if (!product.inStock) return <button className="btn block" disabled>Out of stock</button>;
  return (
    <button
      className="btn primary block"
      onClick={() => {
        cart.add(product, 1);
        setAdded(true);
        setTimeout(() => setAdded(false), 1500);
      }}
    >
      {added ? 'Added' : 'Add to cart'}
    </button>
  );
}
