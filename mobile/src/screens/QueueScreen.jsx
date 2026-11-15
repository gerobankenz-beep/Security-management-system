import React, { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSync, store } from '../sync/SyncContext.jsx';
import { reasonText } from '../lib/shifts.js';
import { kampalaDay, kampalaTime } from '../lib/time.js';
import { Banner, Button, Chip } from '../components.jsx';
import { common } from '../theme';

const TYPE = { check_in: 'Check-in', check_out: 'Check-out', scan: 'Checkpoint scan' };
const STATUS = { pending: ['Waiting', 'warn'], sent: ['Uploaded', 'good'], rejected: ['Refused', 'bad'] };

export default function QueueScreen() {
  const { user } = useAuth();
  const { pending, online, syncing, lastSync, version, syncNow } = useSync();
  const [items, setItems] = useState([]);
  useFocusEffect(useCallback(() => { store.list(user.id).then((l) => setItems(l.slice(0, 200))); }, [user.id, version]));

  return (
    <View style={common.screen}>
      {!online ? <Banner tone="warn">No connection. {pending} waiting. They upload by themselves when the signal returns.</Banner>
        : <Banner tone={pending ? 'info' : 'good'}>{pending ? `${pending} waiting to upload.` : 'Everything is uploaded.'}{lastSync ? ` Last upload check ${kampalaTime(lastSync.toISOString())}.` : ''}</Banner>}
      <FlatList
        contentContainerStyle={common.pad}
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={<Button title="Upload now" onPress={syncNow} busy={syncing} />}
        ListEmptyComponent={<Text style={common.muted}>Nothing recorded on this phone yet.</Text>}
        renderItem={({ item }) => {
          const [label, tone] = STATUS[item.status] || [item.status, 'info'];
          const when = item.payload.scanned_at || item.payload.device_time || item.created_at;
          return (
            <View style={common.card}>
              <View style={common.row}><Text style={common.text}>{TYPE[item.type] || item.type}</Text><Chip tone={tone}>{label}</Chip></View>
              <Text style={common.muted}>{kampalaDay(when)}, {kampalaTime(when)}{item.type === 'scan' ? `  ${item.payload.tag_code}` : ''}</Text>
              {!!item.reason && <Text style={[common.muted, item.status === 'rejected' && { color: '#b42318' }]}>{reasonText(item.reason)}</Text>}
            </View>
          );
        }}
      />
    </View>
  );
}
