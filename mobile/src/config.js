// Settings come from .env (restart with: npx expo start -c)
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
export const USE_MOCKS = String(process.env.EXPO_PUBLIC_USE_MOCKS ?? 'true') === 'true';
export const REQUEST_TIMEOUT_MS = 15000;  // a slow network counts as offline (hosted servers can take a few seconds to wake up)
export const SYNC_INTERVAL_MS = 15000;    // how often the phone tries to upload waiting events
