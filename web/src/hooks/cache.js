// Saves the last successful answer of some lists in localStorage, so a screen can still show
// data when the internet is off. Do NOT cache pay or personal data (guards, payroll).
const PREFIX = 'patrol_cache:';

export function saveCache(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ ...value, at: Date.now() })); } catch { /* storage full or blocked */ }
}

export function readCache(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}

export function clearCache() {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
}
