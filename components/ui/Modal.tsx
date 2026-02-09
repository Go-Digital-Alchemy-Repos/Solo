import React, { useEffect } from 'react';
import { Modal as RNModal, View, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Spacing, Radius, Shadows } from '@/constants/theme';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function Modal({ visible, onClose, children }: ModalProps) {
  const bgOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.95);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      bgOpacity.value = withTiming(1, { duration: 200 });
      contentScale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
      contentOpacity.value = withTiming(1, { duration: 250 });
    } else {
      bgOpacity.value = withTiming(0, { duration: 150 });
      contentScale.value = withTiming(0.95, { duration: 150 });
      contentOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
    opacity: contentOpacity.value,
  }));

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} />
        </Pressable>
        <Animated.View style={[styles.content, Shadows.lg, contentStyle]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            {children}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  content: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    width: '88%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
});
