import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontFamily } from '@/constants/theme';
import Text from './Text';
import Button from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

function FloatingIcon({ children }: { children: React.ReactNode }) {
  const translateY = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

export default function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <View style={styles.iconRing} />
        <View style={styles.iconInner}>
          <FloatingIcon>{icon}</FloatingIcon>
        </View>
      </View>
      <Text variant="h3" align="center" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color={Colors.textDim} align="center" style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} size="md" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  iconRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.12)',
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
  },
  iconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: Spacing.xs,
  },
  message: {
    maxWidth: 260,
    lineHeight: 22,
  },
});
