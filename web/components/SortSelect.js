'use client';

import { useQueryState } from './useQueryState';

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['discount', 'Biggest discount'],
];

export default function SortSelect() {
  const { params, update } = useQueryState();
  return (
    <label className="opt">
      Sort
      <select value={params.get('sort') ?? 'featured'} onChange={(e) => update({ sort: e.target.value === 'featured' ? null : e.target.value })}>
        {SORTS.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
