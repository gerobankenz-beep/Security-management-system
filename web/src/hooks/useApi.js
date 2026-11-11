// Loads data when a screen opens. Gives back { data, meta, loading, error, staleAt, reload }.
//   const { data, loading, error } = useApi(() => listSites({ page }), [page]);
// Option { cacheKey }: remember the last good answer, and show it (staleAt = when it was saved)
// if the network is down. Use it for lists that hold no pay or personal data.
import { useCallback, useEffect, useRef, useState } from 'react';
import { readCache, saveCache } from './cache';

export function useApi(fetcher, deps = [], options = {}) {
  const { cacheKey } = options;
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null, staleAt: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false; // ignore the answer if the screen changed meanwhile
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef.current()
      .then((body) => {
        if (cancelled) return;
        const data = body ? body.data : null;
        const meta = body ? body.meta || null : null;
        if (cacheKey && data) saveCache(cacheKey, { data, meta });
        setState({ data, meta, loading: false, error: null, staleAt: null });
      })
      .catch((error) => {
        if (cancelled) return;
        const cached = cacheKey && error.status === 0 ? readCache(cacheKey) : null;
        if (cached) setState({ data: cached.data, meta: cached.meta, loading: false, error: null, staleAt: cached.at });
        else setState({ data: null, meta: null, loading: false, error, staleAt: null });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, cacheKey]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
