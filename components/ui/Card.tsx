import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { Spacing, Radius, Shadows } from '@/constants/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: keyof typeof Spacing | number;
}

export default function Card({ variant = 'default', padding = 'lg', style, children, ...props }: CardProps) {
  const paddingValue = typeof padding === 'number' ? padding : Spacing[padding];

  return (
    <View
      style={[
        styles.base,
        { padding: paddingValue },
        variant === 'elevated' && [styles.elevated, Shadows.md],
        variant === 'outlined' && styles.outlined,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  elevated: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 0,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
