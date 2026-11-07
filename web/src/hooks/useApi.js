// Loads data when a screen opens. Gives back { data, meta, loading, error, reload }.
//   const { data, loading, error } = useApi(() => listSites({ page }), [page]);
import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false; // ignore the answer if the screen changed meanwhile
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef.current()
      .then((body) => { if (!cancelled) setState({ data: body ? body.data : null, meta: body ? body.meta || null : null, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState({ data: null, meta: null, loading: false, error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
