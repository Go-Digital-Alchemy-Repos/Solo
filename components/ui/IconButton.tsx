import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { HitSlop } from '@/constants/theme';

type IconButtonVariant = 'ghost' | 'filled' | 'outline';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  color?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const sizeMap: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 52 };

export default function IconButton({
  icon, onPress, variant = 'ghost', size = 'md', disabled, testID,
}: IconButtonProps) {
  const scale = useSharedValue(1);
  const dim = sizeMap[size];

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [disabled, onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={HitSlop.md}
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          opacity: disabled ? 0.5 : 1,
        },
        variant === 'filled' && styles.filled,
        variant === 'outline' && styles.outline,
        animStyle,
      ]}
      testID={testID}
    >
      {icon}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  outline: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
