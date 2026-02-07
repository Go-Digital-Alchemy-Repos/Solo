import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface WaveformBarsProps {
  data: number[];
  isPlaying: boolean;
  progress?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
}

function AnimatedProgressOverlay({ progress, height }: { progress: number; height: number }) {
  const glowOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (progress > 0 && progress < 1) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.6, { duration: 600 }),
        ),
        -1,
        true,
      );
    } else {
      glowOpacity.value = withTiming(0.6, { duration: 200 });
    }
  }, [progress > 0 && progress < 1]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          width: `${Math.min(progress * 100, 100)}%`,
          backgroundColor: 'rgba(255, 215, 0, 0.12)',
          borderRightWidth: progress > 0.01 && progress < 0.99 ? 2 : 0,
          borderRightColor: '#FFD700',
        },
        glowStyle,
      ]}
      pointerEvents="none"
    />
  );
}

function AnimatedBar({ value, index, isPlaying, isPast, maxHeight, barWidth, totalBars }: {
  value: number;
  index: number;
  isPlaying: boolean;
  isPast: boolean;
  maxHeight: number;
  barWidth: number;
  totalBars: number;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isPlaying) {
      scale.value = withDelay(
        index * 25,
        withRepeat(
          withSequence(
            withTiming(1.3, { duration: 250 + Math.random() * 200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.65, { duration: 250 + Math.random() * 200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 180, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          true,
        ),
      );
    } else {
      scale.value = withTiming(1, { duration: 300 });
    }
  }, [isPlaying]);

  const barHeight = Math.max(value * maxHeight, 3);
  const gap = barWidth + 2;
  const x = index * gap;

  const animStyle = useAnimatedStyle(() => ({
    height: barHeight * scale.value,
  }));

  return (
    <Animated.View style={[{ width: barWidth, overflow: 'hidden', borderRadius: barWidth / 2 }, animStyle]}>
      <Svg width={barWidth} height={maxHeight} style={{ position: 'absolute', bottom: 0 }}>
        <Defs>
          <LinearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFD700" stopOpacity={isPast ? "1" : "0.35"} />
            <Stop offset="1" stopColor="#FFA500" stopOpacity={isPast ? "1" : "0.2"} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={barWidth} height={maxHeight} fill={`url(#grad-${index})`} rx={barWidth / 2} />
      </Svg>
    </Animated.View>
  );
}

export default function WaveformBars({ data, isPlaying, progress = 0, height = 40, barWidth = 3, gap = 2 }: WaveformBarsProps) {
  return (
    <View style={[styles.container, { height }]}>
      {data.map((value, index) => {
        const barProgress = index / data.length;
        const isPast = barProgress <= progress;
        return (
          <AnimatedBar
            key={index}
            value={value}
            index={index}
            isPlaying={isPlaying}
            isPast={isPast}
            maxHeight={height}
            barWidth={barWidth}
            totalBars={data.length}
          />
        );
      })}
      <AnimatedProgressOverlay progress={progress} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
  },
});
