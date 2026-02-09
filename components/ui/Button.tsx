import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Platform, ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily, Shadows } from '@/constants/theme';
import Text from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const sizeConfig: Record<ButtonSize, { h: number; px: number; fontSize: number }> = {
  sm: { h: 32, px: Spacing.md, fontSize: FontSize.sm },
  md: { h: 40, px: Spacing.xl, fontSize: FontSize.md },
  lg: { h: 48, px: Spacing.xxl, fontSize: FontSize.lg },
};

const variantConfig: Record<ButtonVariant, { bg: string; textColor: string; borderColor: string }> = {
  primary: { bg: Colors.accent, textColor: Colors.bg, borderColor: 'transparent' },
  secondary: { bg: 'transparent', textColor: Colors.accent, borderColor: Colors.accent },
  ghost: { bg: 'transparent', textColor: Colors.textDim, borderColor: 'transparent' },
  danger: { bg: Colors.danger, textColor: '#fff', borderColor: 'transparent' },
};

export default function Button({
  title, onPress, variant = 'primary', size = 'md', disabled, loading, icon, fullWidth, testID,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const sc = sizeConfig[size];
  const vc = variantConfig[variant];

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [disabled, loading, onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          height: sc.h,
          paddingHorizontal: sc.px,
          backgroundColor: vc.bg,
          borderColor: vc.borderColor,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        variant === 'primary' && Shadows.sm,
        animStyle,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={vc.textColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            variant="label"
            color={vc.textColor}
            style={{ fontSize: sc.fontSize }}
          >
            {title}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
