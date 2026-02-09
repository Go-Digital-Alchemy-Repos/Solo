import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Radius, Spacing } from '@/constants/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: any;
}

export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const opacity = useSharedValue(0.06);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: '#fff' },
        animStyle,
        style,
      ]}
    />
  );
}

export function SoundCardSkeleton() {
  return (
    <View style={skStyles.card}>
      <View style={skStyles.header}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={skStyles.headerInfo}>
          <Skeleton width={100} height={14} />
          <Skeleton width={70} height={11} style={{ marginTop: 4 }} />
        </View>
        <Skeleton width={50} height={12} />
      </View>
      <Skeleton width="75%" height={18} style={{ marginBottom: Spacing.sm }} />
      <Skeleton width="100%" height={64} radius={Radius.md} style={{ marginBottom: Spacing.sm }} />
      <Skeleton width="100%" height={3} radius={2} style={{ marginBottom: Spacing.md }} />
      <View style={skStyles.controls}>
        <Skeleton width={40} height={40} radius={20} />
        <Skeleton width={80} height={14} />
      </View>
      <View style={skStyles.social}>
        <Skeleton width={40} height={14} />
        <Skeleton width={40} height={14} />
        <Skeleton width={24} height={14} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={skStyles.profileWrap}>
      <Skeleton width={94} height={94} radius={47} style={{ alignSelf: 'center' }} />
      <Skeleton width={140} height={22} style={{ alignSelf: 'center', marginTop: Spacing.md }} />
      <Skeleton width={90} height={14} style={{ alignSelf: 'center', marginTop: Spacing.xs }} />
      <View style={skStyles.statsRow}>
        <View style={skStyles.stat}>
          <Skeleton width={30} height={20} />
          <Skeleton width={50} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={skStyles.stat}>
          <Skeleton width={30} height={20} />
          <Skeleton width={50} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={skStyles.stat}>
          <Skeleton width={30} height={20} />
          <Skeleton width={50} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

const skStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  profileWrap: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxxl,
    marginTop: Spacing.xl,
  },
  stat: {
    alignItems: 'center',
  },
});
