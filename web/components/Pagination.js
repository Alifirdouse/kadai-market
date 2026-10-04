'use client';

import { useQueryState } from './useQueryState';

export default function Pagination({ page, pages }) {
  const { update } = useQueryState();
  if (pages <= 1) return null;
  return (
    <nav className="row-between" style={{ marginTop: 16 }} aria-label="Pages">
      <button className="btn" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button>
      <span className="muted num">Page {page} of {pages}</span>
      <button className="btn" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>Next</button>
    </nav>
  );
}
