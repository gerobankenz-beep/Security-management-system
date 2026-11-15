# Guard mobile app (Expo SDK 57)

Guards log in, see their shifts, check in and out, and scan checkpoint QR codes. It works with no signal:
every check-in, check-out and scan is saved on the phone first, then uploaded in the background.

## What was wrong with the old folder
`mobile\package.json`, `README.md` and `src\` had been overwritten by the web project's files (Vite, react-router, `patrol-web`).
That removed Expo, so the app could not start. This update puts the guard app back. Your `.env`, `assets` and `app.json` are kept.

## Apply (PowerShell)
```
cd D:\Personal\SM-SYS\mobile
copy .env ..\mobile-env-backup.txt
Remove-Item -Recurse -Force src, README.md, package.json
# unzip this update and copy everything inside its mobile folder into D:\Personal\SM-SYS\mobile
# (say yes to replace; do NOT delete your .env)
npm install
npm test                    # expect: # pass 16
npx expo start -c
```
Install new Expo packages here only with `npx expo install <name>`. Never install them in `web`.

## .env
```
EXPO_PUBLIC_USE_MOCKS=true     # demo data, no backend needed
EXPO_PUBLIC_API_URL=http://<your laptop IPv4>:4000/api/v1   # run ipconfig. Not localhost.
```
Change it, then restart with `npx expo start -c`. Phone and laptop must be on the same Wi-Fi.

## Demo mode (no backend)
Sign in with `amina@example.com` / `Password123!` (pre-filled). Shift 1 is open now.
Use the "Pretend to be offline" switch at the bottom of My Shifts to try the queue without airplane mode.
Scan these codes (or type them): CP-1-1-A1B2, CP-1-2-C3D4, CP-1-3-E5F6, CP-1-4-G7H8.

## Real backend
Set `EXPO_PUBLIC_USE_MOCKS=false`, run the backend (update 3 applied, `npm run demo:flow` once, rosters published),
log in as `amina@example.com`. Print the QR sheet from the web app (Sites > QR sheet) and scan those codes.

## Airplane-mode demo
1. Open a shift while online (this saves the route and rounds on the phone).
2. Turn on airplane mode.
3. Check in. Scan 3 checkpoints. Check out. The Queue shows each one as Waiting.
4. Turn airplane mode off. Within 15 seconds (or press Upload now) they turn Uploaded.
5. In the web app, Attendance shows the check-in and out, and the rounds show the scans.
Pressing Upload now twice, or sending the same event twice, never creates a second record.

## Rules the app follows
- Each event has an id made on the phone (client_event_id / client_scan_id), so a resend is safe.
- A missing GPS fix never blocks anything. The server marks it "needs review".
- A refused event (server says no) shows as Refused with the reason. It does not retry forever.
- No signal, a timeout or a server fault keeps events Waiting. They are never dropped.
- Times are shown in Kampala time (UTC+3).

## Files
- `src/lib/sync.js` the upload rules, `src/lib/shifts.js` what a guard may do now, `src/db.js` SQLite
- `src/api/` server calls, `src/mocks/` demo backend, `src/screens/` the five screens
- `tests/` logic tests: `npm test` (no phone needed)
