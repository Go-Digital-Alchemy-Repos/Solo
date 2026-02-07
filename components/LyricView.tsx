import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import type { TranscriptWord } from '@/lib/data-context';

interface LyricViewProps {
  words: TranscriptWord[];
  positionMs: number;
  isActive: boolean;
  height?: number;
}

function LyricWord({ word, isActive, isPast }: { word: TranscriptWord; isActive: boolean; isPast: boolean }) {
  const animStyle = useAnimatedStyle(() => ({
    color: withTiming(isActive ? Colors.accent : isPast ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.25)', { duration: 150 }),
    transform: [{ scale: withTiming(isActive ? 1.05 : 1, { duration: 150 }) }],
  }));

  return (
    <Animated.Text style={[styles.word, animStyle]}>
      {word.word}{' '}
    </Animated.Text>
  );
}

export default function LyricView({ words, positionMs, isActive, height = 80 }: LyricViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const positionSec = positionMs / 1000;

  const activeIndex = useMemo(() => {
    if (!isActive || words.length === 0) return -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (positionSec >= words[i].start) return i;
    }
    return -1;
  }, [positionSec, isActive, words]);

  const lineGroups = useMemo(() => {
    const groups: TranscriptWord[][] = [];
    let current: TranscriptWord[] = [];
    const wordsPerLine = 6;
    words.forEach((w, i) => {
      current.push(w);
      if (current.length >= wordsPerLine || i === words.length - 1) {
        groups.push(current);
        current = [];
      }
    });
    return groups;
  }, [words]);

  const activeLineIndex = useMemo(() => {
    if (activeIndex < 0) return 0;
    const wordsPerLine = 6;
    return Math.floor(activeIndex / wordsPerLine);
  }, [activeIndex]);

  useEffect(() => {
    if (scrollRef.current && activeLineIndex >= 0) {
      const lineHeight = 36;
      const scrollY = Math.max(0, activeLineIndex * lineHeight - height / 2 + lineHeight / 2);
      scrollRef.current.scrollTo({ y: scrollY, animated: true });
    }
  }, [activeLineIndex, height]);

  if (words.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No transcript available</Text>
      </View>
    );
  }

  let wordGlobalIndex = 0;

  return (
    <View style={[styles.container, { height }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {lineGroups.map((line, lineIdx) => (
          <View key={lineIdx} style={styles.line}>
            {line.map((word) => {
              const idx = wordGlobalIndex++;
              const isWordActive = idx === activeIndex;
              const isPast = idx < activeIndex;
              return (
                <LyricWord
                  key={`${lineIdx}-${idx}`}
                  word={word}
                  isActive={isWordActive}
                  isPast={isPast}
                />
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingVertical: 8,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    minHeight: 32,
    alignItems: 'center',
    marginBottom: 4,
  },
  word: {
    fontSize: 18,
    fontFamily: 'DMSans_600SemiBold',
    lineHeight: 28,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
});
