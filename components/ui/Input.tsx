import React, { useState, useCallback } from 'react';
import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import Text from './Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback((e: any) => {
    setFocused(true);
    props.onFocus?.(e);
  }, [props.onFocus]);

  const handleBlur = useCallback((e: any) => {
    setFocused(false);
    props.onBlur?.(e);
  }, [props.onBlur]);

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text variant="label" color={Colors.textDim} style={styles.label}>
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={Colors.textMuted}
        {...props}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          props.multiline && styles.multiline,
          style,
        ]}
      />
      {error && (
        <Text variant="caption" color={Colors.danger} style={styles.message}>
          {error}
        </Text>
      )}
      {hint && !error && (
        <Text variant="caption" color={Colors.textMuted} style={styles.message}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputFocused: {
    borderColor: Colors.accent,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top' as const,
    paddingTop: Spacing.md,
  },
  message: {
    marginTop: 2,
    marginLeft: Spacing.xs,
  },
});
