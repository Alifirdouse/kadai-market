'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Filters live in the URL (?inStock=1&new=1&category=Pickles) so results are shareable and SEO-friendly
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === '' || v === false) next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in changes)) next.delete('page'); // any filter change goes back to page 1
      router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return { params, update };
}
