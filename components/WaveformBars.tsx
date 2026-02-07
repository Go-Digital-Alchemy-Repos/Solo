import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface WaveformBarsProps {
  data: number[];
  isPlaying: boolean;
  progress?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
}

function AnimatedBar({ value, index, isPlaying, progress, maxHeight, barWidth }: {
  value: number;
  index: number;
  isPlaying: boolean;
  progress: number;
  maxHeight: number;
  barWidth: number;
}) {
  const scale = useSharedValue(1);
  const totalBars = 40;
  const barProgress = index / totalBars;
  const isPast = barProgress <= progress;

  useEffect(() => {
    if (isPlaying) {
      scale.value = withDelay(
        index * 30,
        withRepeat(
          withSequence(
            withTiming(1.3, { duration: 300 + Math.random() * 200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.7, { duration: 300 + Math.random() * 200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          true,
        ),
      );
    } else {
      scale.value = withTiming(1, { duration: 300 });
    }
  }, [isPlaying]);

  const animStyle = useAnimatedStyle(() => ({
    height: value * maxHeight * scale.value,
    backgroundColor: isPast ? Colors.accent : 'rgba(255, 215, 0, 0.3)',
  }));

  return (
    <Animated.View
      style={[
        {
          width: barWidth,
          borderRadius: barWidth / 2,
          minHeight: 3,
        },
        animStyle,
      ]}
    />
  );
}

export default function WaveformBars({ data, isPlaying, progress = 0, height = 40, barWidth = 3, gap = 2 }: WaveformBarsProps) {
  return (
    <View style={[styles.container, { height }]}>  
      {data.map((value, index) => (
        <AnimatedBar
          key={index}
          value={value}
          index={index}
          isPlaying={isPlaying}
          progress={progress}
          maxHeight={height}
          barWidth={barWidth}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
