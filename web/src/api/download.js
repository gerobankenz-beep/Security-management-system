// CSV downloads need the login token, so a plain link will not work. This fetches the file and saves it.
import { getToken, USE_MOCKS } from './client';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export async function downloadFile(path, query, filename) {
  if (USE_MOCKS) throw new Error('Exports need the real backend. Set VITE_USE_MOCKS=false in web/.env and restart.');
  const url = new URL(API_URL + path);
  Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error((j && j.error && j.error.message) || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
