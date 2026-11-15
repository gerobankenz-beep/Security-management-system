// Uploads what is waiting in the queue. Safe to run again and again: the server ignores ids it has seen.
//  - no signal or a server fault  -> keep everything waiting, try later
//  - the server says "no" (4xx)    -> mark that one Rejected, keep going
//  - "already checked in/out"      -> the server already has it, so it counts as uploaded
const MAX_BATCH = 100;
const ALREADY = { check_in: 'ALREADY_CHECKED_IN', check_out: 'ALREADY_CHECKED_OUT' };

export async function syncPending({ store, api, userId, deviceId }) {
  const items = await store.pending(userId);
  const out = { sent: 0, rejected: 0, left: 0, offline: false, authExpired: false, serverTrouble: false };
  if (!items.length) return out;

  const stop = async (item, e) => {
    await store.update(item.id, { attempts: (item.attempts || 0) + 1 });
    if (e && e.network) out.offline = true;
    else if (e && e.status === 401) out.authExpired = true;
    else out.serverTrouble = true;
  };

  for (const it of items.filter((x) => x.type !== 'scan')) {
    try {
      const send = it.type === 'check_in' ? api.checkIn : api.checkOut;
      await send({ client_event_id: it.id, shift_id: it.shift_id, device_id: deviceId, ...it.payload });
      await store.update(it.id, { status: 'sent', reason: null }); out.sent++;
    } catch (e) {
      if (e.status === 409 && e.code === ALREADY[it.type]) { await store.update(it.id, { status: 'sent', reason: 'Already recorded' }); out.sent++; continue; }
      if (e.network || e.status === 401 || !(e.status >= 400 && e.status < 500)) { await stop(it, e); break; }
      await store.update(it.id, { status: 'rejected', reason: e.message || e.code || 'Rejected' }); out.rejected++;
    }
  }

  if (!out.offline && !out.authExpired && !out.serverTrouble) {
    const scans = items.filter((x) => x.type === 'scan');
    for (let i = 0; i < scans.length; i += MAX_BATCH) {
      const chunk = scans.slice(i, i + MAX_BATCH);
      try {
        const results = await api.scansBatch(chunk.map((s) => ({ client_scan_id: s.id, shift_id: s.shift_id, device_id: deviceId, ...s.payload })));
        const byId = new Map(results.map((r) => [r.client_scan_id, r]));
        for (const s of chunk) {
          const r = byId.get(s.id);
          if (r && r.status === 'rejected') { await store.update(s.id, { status: 'rejected', reason: r.reason || 'Rejected' }); out.rejected++; }
          else if (r) { await store.update(s.id, { status: 'sent', reason: r.status === 'duplicate' ? 'Already recorded' : null }); out.sent++; }
          else await store.update(s.id, { attempts: (s.attempts || 0) + 1 }); // no answer for it: try again later
        }
      } catch (e) { await stop(chunk[0], e); break; }
    }
  }
  out.left = await store.pendingCount(userId);
  return out;
}
