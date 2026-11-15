import { StyleSheet } from 'react-native';

export const colors = { navy: '#12284c', blue: '#2557a7', bg: '#f3f5f9', card: '#ffffff', line: '#dde3ee', text: '#1b2433', muted: '#667085',
  good: '#177245', goodBg: '#e3f4ea', warn: '#9a5b00', warnBg: '#fff1d6', bad: '#b42318', badBg: '#fde8e6' };

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  h2: { fontSize: 16, fontWeight: '700', color: colors.navy, marginBottom: 8 },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  button: { backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonAlt: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.navy },
  buttonAltText: { color: colors.navy },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  banner: { paddingVertical: 8, paddingHorizontal: 14 },
  bannerText: { fontSize: 13, fontWeight: '600' },
});
