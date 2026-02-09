import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { FontSize, FontFamily } from '@/constants/theme';

type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label' | 'overline';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

const variantStyles: Record<TextVariant, { fontSize: number; fontFamily: string; lineHeight: number; letterSpacing: number }> = {
  display: { fontSize: FontSize.display, fontFamily: FontFamily.bold, lineHeight: 52, letterSpacing: -1 },
  h1: { fontSize: FontSize.xxxl, fontFamily: FontFamily.bold, lineHeight: 34, letterSpacing: -0.5 },
  h2: { fontSize: FontSize.xxl, fontFamily: FontFamily.bold, lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontSize: FontSize.xl, fontFamily: FontFamily.semibold, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontSize: FontSize.md, fontFamily: FontFamily.regular, lineHeight: 20, letterSpacing: 0 },
  bodySmall: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 18, letterSpacing: 0 },
  caption: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, lineHeight: 16, letterSpacing: 0.2 },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, lineHeight: 16, letterSpacing: 0.3 },
  overline: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold, lineHeight: 14, letterSpacing: 1 },
};

export default function Text({ variant = 'body', color, align, bold, style, ...props }: TextProps) {
  const vs = variantStyles[variant];
  return (
    <RNText
      style={[
        {
          fontSize: vs.fontSize,
          fontFamily: bold ? FontFamily.bold : vs.fontFamily,
          lineHeight: vs.lineHeight,
          letterSpacing: vs.letterSpacing,
          color: color ?? Colors.text,
          textAlign: align,
        },
        variant === 'overline' && { textTransform: 'uppercase' as const },
        style,
      ]}
      {...props}
    />
  );
}
