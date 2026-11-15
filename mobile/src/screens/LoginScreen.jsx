import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext.jsx';
import { API_URL, USE_MOCKS } from '../config.js';
import { Banner, Button } from '../components.jsx';
import { colors, common } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState(USE_MOCKS ? 'amina@example.com' : '');
  const [password, setPassword] = useState(USE_MOCKS ? 'Password123!' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try { await login(email, password); }
    catch (e) { setError(e.network ? `Cannot reach the server at ${API_URL}. Check the address in .env and that the backend is running.` : e.message); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.navy, marginBottom: 4 }}>Patrol</Text>
        <Text style={[common.muted, { marginBottom: 24 }]}>Guard app: shifts, check-in and checkpoint scans</Text>
        {USE_MOCKS && <View style={{ marginBottom: 12 }}><Banner tone="warn">Demo mode: fake data, no server needed.</Banner></View>}
        <TextInput style={common.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} value={email} onChangeText={setEmail} accessibilityLabel="Email" />
        <TextInput style={common.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" onSubmitEditing={submit} />
        {!!error && <Text style={{ color: colors.bad, marginBottom: 12 }} accessibilityRole="alert">{error}</Text>}
        <Button title="Sign in" onPress={submit} busy={busy} />
        {!USE_MOCKS && <Text style={[common.muted, { marginTop: 12 }]}>Server: {API_URL}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
