import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSync, store } from '../sync/SyncContext.jsx';
import { getMyShifts } from '../api/endpoints.js';
import { loadWithCache } from '../lib/loadWithCache.js';
import { kampalaDay, kampalaTime } from '../lib/time.js';
import { USE_MOCKS } from '../config.js';
import { isMockOffline, setMockOffline } from '../mocks/index.js';
import { Banner, Chip } from '../components.jsx';
import { colors, common } from '../theme';

const STATUS = { scheduled: ['Scheduled', 'info'], in_progress: ['On duty', 'good'], completed: ['Done', 'good'], missed: ['Missed', 'bad'], cancelled: ['Cancelled', 'bad'] };

export default function ShiftsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { pending, online, setOnline, version, syncNow } = useSync();
  const [shifts, setShifts] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mockOff, setMockOff] = useState(isMockOffline());

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await loadWithCache(store, `shifts:${user.id}`, getMyShifts);
      setShifts(r.data); setSaved(r.saved); setOnline(!r.offline);
    } catch (e) { setError(e.message); }
  }, [user.id, setOnline]);

  useFocusEffect(useCallback(() => { load(); }, [load, version]));
  useEffect(() => { if (online) load(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => (
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Pressable onPress={() => navigation.navigate('Queue')} accessibilityLabel={`Upload queue, ${pending} waiting`}><Text style={{ color: colors.blue, fontWeight: '700' }}>Queue{pending ? ` (${pending})` : ''}</Text></Pressable>
        <Pressable onPress={logout} accessibilityLabel="Log out"><Text style={{ color: colors.muted, fontWeight: '700' }}>Log out</Text></Pressable>
      </View>) });
  }, [navigation, pending, logout]);

  async function refresh() { setRefreshing(true); await syncNow(); await load(); setRefreshing(false); }

  return (
    <View style={common.screen}>
      {!online && <Banner tone="warn">No connection. Showing saved shifts. Check-ins and scans are kept on this phone and upload automatically.</Banner>}
      {online && pending > 0 && <Banner tone="info">{pending} item{pending === 1 ? '' : 's'} waiting to upload.</Banner>}
      <FlatList
        contentContainerStyle={common.pad}
        data={shifts || []}
        keyExtractor={(s) => String(s.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={<Text style={[common.title, { marginBottom: 12 }]}>Hello, {user.full_name}</Text>}
        ListEmptyComponent={<Text style={common.muted}>{error || (shifts ? 'No shifts on your roster for the next two weeks.' : 'Loading...')}</Text>}
        renderItem={({ item: s }) => {
          const [label, tone] = STATUS[s.status] || [s.status, 'info'];
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${s.template_name} shift at ${s.site_name}`} onPress={() => navigation.navigate('Shift', { shift: s })} style={common.card}>
              <View style={common.row}><Text style={common.h2}>{kampalaDay(s.start_at)}</Text><Chip tone={tone}>{label}</Chip></View>
              <Text style={common.text}>{s.template_name} shift, {kampalaTime(s.start_at)} to {kampalaTime(s.end_at)}</Text>
              <Text style={common.muted}>{s.site_name}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={USE_MOCKS ? (
          <View style={[common.card, common.row]}>
            <Text style={common.muted}>Pretend to be offline (demo only)</Text>
            <Switch value={mockOff} onValueChange={(v) => { setMockOffline(v); setMockOff(v); if (!v) syncNow().then(load); else load(); }} />
          </View>) : null}
      />
    </View>
  );
}
