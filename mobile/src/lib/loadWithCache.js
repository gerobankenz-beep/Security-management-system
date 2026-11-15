// Fetch from the server and keep a copy. With no signal, fall back to the saved copy.
export async function loadWithCache(store, key, fetcher) {
  try {
    const data = await fetcher();
    await store.setCache(key, data);
    return { data, saved: false };
  } catch (e) {
    if (e && e.network) {
      const copy = await store.getCache(key);
      if (copy !== null && copy !== undefined) return { data: copy, saved: true, offline: true };
    }
    throw e;
  }
}
