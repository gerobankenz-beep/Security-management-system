import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, common } from './theme';

export function Button({ title, onPress, alt, disabled, busy }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress}
      style={[common.button, alt && common.buttonAlt, (disabled || busy) && common.disabled]}>
      <Text style={[common.buttonText, alt && common.buttonAltText]}>{busy ? 'Please wait...' : title}</Text>
    </Pressable>
  );
}

const TONES = { good: [colors.goodBg, colors.good], warn: [colors.warnBg, colors.warn], bad: [colors.badBg, colors.bad], info: ['#e8eefb', colors.blue] };
export function Banner({ tone = 'info', children }) {
  const [bg, fg] = TONES[tone];
  return <View style={[common.banner, { backgroundColor: bg }]}><Text style={[common.bannerText, { color: fg }]}>{children}</Text></View>;
}

export function Chip({ tone = 'info', children }) {
  const [bg, fg] = TONES[tone];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{children}</Text></View>;
}
