import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const TOPICS = [
  { key: null, label: 'Trending' },
  { key: 'Sports', label: 'Sports' },
  { key: 'Politics', label: 'Politics' },
  { key: 'Business', label: 'Business' },
  { key: 'Religion', label: 'Religion' },
  { key: 'Pop Culture', label: 'Pop Culture' },
  { key: 'Tech', label: 'Tech' },
  { key: 'Lifestyle', label: 'Lifestyle' },
  { key: 'Music', label: 'Music' },
  { key: 'Comedy', label: 'Comedy' },
  { key: 'Health', label: 'Health' },
] as const;

interface FeedTopicBarProps {
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export default function FeedTopicBar({ selectedTag, onSelectTag }: FeedTopicBarProps) {
  const scrollRef = useRef<ScrollView>(null);

  const handlePress = (tag: string | null) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelectTag(tag);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TOPICS.map((topic) => {
          const isActive = selectedTag === topic.key;
          return (
            <Pressable
              key={topic.key ?? 'trending'}
              onPress={() => handlePress(topic.key)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {topic.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 2,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  chipTextActive: {
    color: Colors.bg,
  },
});
