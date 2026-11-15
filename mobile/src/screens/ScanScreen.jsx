import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSync, store } from '../sync/SyncContext.jsx';
import { getFix } from '../lib/location.js';
import { kampalaTime } from '../lib/time.js';
import { Banner, Button } from '../components.jsx';
import { colors, common } from '../theme';

const SAME_CODE_MS = 5000; // the camera sees one QR code many times a second; save it once

export default function ScanScreen({ route: nav }) {
  const { shift } = nav.params;
  const { enqueue } = useSync();
  const [permission, requestPermission] = useCameraPermissions();
  const [last, setLast] = useState(null);
  const [manual, setManual] = useState('');
  const [checkpoints, setCheckpoints] = useState(null);
  const recent = useRef({ tag: null, at: 0 });

  useEffect(() => { store.getCache(`route:${shift.id}`).then((r) => setCheckpoints(r ? r.checkpoints : null)); }, [shift.id]);

  async function save(raw) {
    const tag = String(raw || '').trim();
    if (!tag) return;
    const nowMs = Date.now();
    if (recent.current.tag === tag && nowMs - recent.current.at < SAME_CODE_MS) return;
    recent.current = { tag, at: nowMs };
    Vibration.vibrate(80);
    const scannedAt = new Date().toISOString();
    const fix = await getFix(1500);
    await enqueue('scan', shift.id, { tag_code: tag, scanned_at: scannedAt, ...(fix || {}) });
    const cp = checkpoints && checkpoints.find((c) => c.tag_code === tag);
    setLast({ tag, name: cp ? cp.name : null, unknown: !!checkpoints && !cp, at: scannedAt, gps: !!fix });
  }

  const granted = permission && permission.granted;
  return (
    <ScrollView style={common.screen} contentContainerStyle={common.pad} keyboardShouldPersistTaps="handled">
      {!permission && <Text style={common.muted}>Checking camera permission...</Text>}
      {permission && !granted && (
        <View style={common.card}>
          <Text style={common.text}>The camera is needed to scan checkpoint QR codes.</Text>
          <View style={{ height: 12 }} />
          <Button title="Allow camera" onPress={requestPermission} />
        </View>
      )}
      {granted && (
        <View style={{ height: 320, borderRadius: 16, overflow: 'hidden', marginBottom: 12, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => save(data)} />
        </View>
      )}
      <Text style={[common.muted, { marginBottom: 12 }]}>Point the camera at the checkpoint's QR code. It saves by itself.</Text>

      {last && (
        <View style={{ marginBottom: 12 }}>
          <Banner tone={last.unknown ? 'warn' : 'good'}>
            {last.unknown ? `Saved, but ${last.tag} is not on this site's route.` : `Saved: ${last.name || last.tag} at ${kampalaTime(last.at)}.`}{last.gps ? '' : ' No GPS fix.'} It uploads automatically.
          </Banner>
        </View>
      )}

      <View style={common.card}>
        <Text style={common.h2}>Camera not working?</Text>
        <TextInput style={common.input} placeholder="Type the code printed under the QR" autoCapitalize="characters" autoCorrect={false} value={manual} onChangeText={setManual} accessibilityLabel="Checkpoint code" />
        <Button title="Save code" alt onPress={() => { save(manual); setManual(''); }} disabled={!manual.trim()} />
      </View>
    </ScrollView>
  );
}
