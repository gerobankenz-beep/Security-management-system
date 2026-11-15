import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSync, store } from '../sync/SyncContext.jsx';
import { getShiftRounds, getShiftRoute } from '../api/endpoints.js';
import { loadWithCache } from '../lib/loadWithCache.js';
import { getFix } from '../lib/location.js';
import { shiftActions } from '../lib/shifts.js';
import { kampalaDay, kampalaTime } from '../lib/time.js';
import { Banner, Button, Chip } from '../components.jsx';
import { colors, common } from '../theme';

const cap = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function ShiftScreen({ route: nav, navigation }) {
  const { user } = useAuth();
  const { enqueue, online, setOnline, version, syncNow } = useSync();
  const [shift, setShift] = useState(nav.params.shift);
  const [items, setItems] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await store.list(user.id);
    setItems(list.filter((i) => i.shift_id === shift.id));
    const shifts = await store.getCache(`shifts:${user.id}`);
    const fresh = shifts && shifts.find((s) => s.id === shift.id);
    if (fresh) setShift(fresh);
    const get = async (key, fn, set) => { try { const r = await loadWithCache(store, key, fn); set(r.data); setOnline(!r.offline); } catch (e) { if (e.network) setOnline(false); } };
    await Promise.all([get(`route:${shift.id}`, () => getShiftRoute(shift.id), setRouteInfo), get(`rounds:${shift.id}`, () => getShiftRounds(shift.id), setRounds)]);
  }, [user.id, shift.id, setOnline]);

  useFocusEffect(useCallback(() => { load(); }, [load, version]));
  useEffect(() => { navigation.setOptions({ title: `${shift.template_name} shift` }); }, [navigation, shift.template_name]);

  const mine = (type) => items.find((i) => i.type === type && i.status !== 'rejected');
  const a = shiftActions(shift, { checkIn: mine('check_in'), checkOut: mine('check_out') });
  const scans = items.filter((i) => i.type === 'scan' && i.status !== 'rejected');
  const lastScan = {};
  scans.forEach((s) => { const t = s.payload.tag_code; if (!lastScan[t] || s.payload.scanned_at > lastScan[t]) lastScan[t] = s.payload.scanned_at; });
  const rejected = items.filter((i) => i.status === 'rejected').length;
  const waiting = items.filter((i) => i.status === 'pending').length;

  async function act(type) {
    setBusy(true); setNote('');
    try {
      const fix = await getFix(3000);
      await enqueue(type, shift.id, { device_time: new Date().toISOString(), ...(fix || {}) });
      setNote(`${type === 'check_in' ? 'Check-in' : 'Check-out'} saved on this phone${fix ? '' : ' (no GPS fix, a supervisor may review it)'}. It uploads automatically.`);
    } finally { setBusy(false); }
  }
  const confirmCheckOut = () => Alert.alert('Check out?', 'Only check out when your shift is over.', [{ text: 'Not yet', style: 'cancel' }, { text: 'Check out', style: 'destructive', onPress: () => act('check_out') }]);

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.pad}>
      {!online && <View style={{ marginBottom: 12 }}><Banner tone="warn">Offline. Everything you do is saved on this phone and uploads when the signal returns.</Banner></View>}
      <View style={common.card}>
        <Text style={common.title}>{shift.site_name}</Text>
        <Text style={common.text}>{kampalaDay(shift.start_at)}, {kampalaTime(shift.start_at)} to {kampalaTime(shift.end_at)}</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
          <Chip tone={a.checkedOut ? 'good' : a.checkedIn ? 'good' : 'info'}>{a.checkedOut ? 'Checked out' : a.checkedIn ? 'On duty' : 'Not checked in'}</Chip>
          {waiting > 0 && <Chip tone="warn">{waiting} waiting to upload</Chip>}
        </View>
      </View>

      {!!note && <View style={{ marginBottom: 12 }}><Banner tone="good">{note}</Banner></View>}
      {rejected > 0 && <View style={{ marginBottom: 12 }}><Banner tone="bad">{rejected} item{rejected === 1 ? ' was' : 's were'} refused by the server. Open Queue to see why.</Banner></View>}
      {a.checkInBlock && !a.checkedIn && <Text style={[common.muted, { marginBottom: 8 }]}>{a.checkInBlock}</Text>}

      <Button title="Check in" onPress={() => act('check_in')} disabled={!a.canCheckIn} busy={busy} />
      <Button title="Scan checkpoint" onPress={() => navigation.navigate('Scan', { shift })} disabled={!a.canScan} />
      <Button title="Check out" alt onPress={confirmCheckOut} disabled={!a.canCheckOut} busy={busy} />
      <Button title="Upload now" alt onPress={syncNow} />

      <Text style={[common.h2, { marginTop: 12 }]}>Rounds</Text>
      {rounds.length === 0 && <Text style={common.muted}>Rounds appear here once your roster is published.</Text>}
      {rounds.map((r) => (
        <View key={r.id} style={[common.card, common.row]}>
          <View><Text style={common.text}>Round {r.round_index}</Text><Text style={common.muted}>{kampalaTime(r.window_start)} to {kampalaTime(r.window_end)}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Chip tone={r.status === 'complete' || r.status === 'completed' ? 'good' : r.status === 'missed' || r.status === 'flagged' ? 'bad' : 'info'}>{cap(r.status)}</Chip><Text style={common.muted}>{r.scans_done}/{r.scans_expected} checkpoints</Text></View>
        </View>
      ))}

      {routeInfo && (
        <>
          <Text style={[common.h2, { marginTop: 12 }]}>Checkpoints on {routeInfo.name}</Text>
          {routeInfo.checkpoints.map((c) => (
            <View key={c.id} style={[common.card, common.row]}>
              <Text style={common.text}>{c.sequence ? `${c.sequence}. ` : ''}{c.name}</Text>
              <Text style={[common.muted, lastScan[c.tag_code] && { color: colors.good }]}>{lastScan[c.tag_code] ? `Scanned ${kampalaTime(lastScan[c.tag_code])}` : 'Not scanned yet'}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
