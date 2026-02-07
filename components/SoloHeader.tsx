import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface SoloHeaderProps {
  absolute?: boolean;
  children?: React.ReactNode;
}

export default function SoloHeader({ absolute = false, children }: SoloHeaderProps) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[
      styles.container,
      absolute && styles.absolute,
      { paddingTop: topInset + 4 },
    ]}>
      <View style={styles.row}>
        <View style={styles.logoRow}>
          <Ionicons name="mic" size={22} color={Colors.accent} />
          <Text style={styles.logoText}>Solo</Text>
        </View>
        {children && <View style={styles.right}>{children}</View>}
      </View>
      <View style={styles.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    paddingHorizontal: 20,
    paddingBottom: 10,
    zIndex: 10,
  },
  absolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoText: {
    fontSize: 26,
    fontFamily: 'DMSans_700Bold',
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accent: {
    height: 2,
    width: 40,
    backgroundColor: Colors.accent,
    borderRadius: 1,
    marginTop: 4,
  },
});
