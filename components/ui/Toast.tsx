import React, { useEffect, createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontFamily, FontSize, Shadows } from '@/constants/theme';
import Text from './Text';

type ToastType = 'success' | 'error' | 'info';

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const iconMap: Record<ToastType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { name: 'checkmark-circle', color: Colors.success },
  error: { name: 'alert-circle', color: Colors.danger },
  info: { name: 'information-circle', color: Colors.accent },
};

let toastCounter = 0;

function ToastItem({ data, onDone }: { data: ToastData; onDone: (id: number) => void }) {
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
    opacity.value = withTiming(1, { duration: 300 });

    translateY.value = withDelay(2500, withTiming(-60, { duration: 250 }, () => {
      runOnJS(onDone)(data.id);
    }));
    opacity.value = withDelay(2500, withTiming(0, { duration: 250 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const { name, color } = iconMap[data.type];

  return (
    <Animated.View style={[styles.toast, Shadows.md, animStyle]}>
      <Ionicons name={name} size={20} color={color} />
      <Text variant="bodySmall" color={Colors.text} style={styles.toastText}>
        {data.message}
      </Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
  }, []);

  const removeDone = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View style={[styles.container, { top: topInset + Spacing.sm }]} pointerEvents="none">
        {toasts.map(t => (
          <ToastItem key={t.id} data={t} onDone={removeDone} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: 360,
    width: '100%',
  },
  toastText: {
    flex: 1,
  },
});
