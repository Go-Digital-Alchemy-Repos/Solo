import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface TeleprompterProps {
  isRecording: boolean;
  isPaused: boolean;
  scrollSpeed?: number;
}

export default function Teleprompter({ isRecording, isPaused, scrollSpeed = 30 }: TeleprompterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isRecording && !isPaused && text.length > 0 && isExpanded) {
      intervalRef.current = setInterval(() => {
        scrollY.current += scrollSpeed / 60;
        scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });
      }, 1000 / 60);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRecording, isPaused, text, isExpanded, scrollSpeed]);

  useEffect(() => {
    if (!isRecording) {
      scrollY.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isRecording]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  if (!isExpanded) {
    return (
      <Pressable onPress={handleToggle} style={styles.collapsedContainer}>
        <Ionicons name="document-text-outline" size={16} color={Colors.textDim} />
        <Text style={styles.collapsedLabel}>Teleprompter</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
      </Pressable>
    );
  }

  const activelyScrolling = isRecording && !isPaused && text.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="document-text" size={16} color={Colors.accent} />
          <Text style={styles.headerLabel}>Teleprompter</Text>
        </View>
        <View style={styles.headerRight}>
          {!isRecording && text.length > 0 && (
            <Pressable onPress={() => setIsEditing(!isEditing)}>
              <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={18} color={Colors.accent} />
            </Pressable>
          )}
          <Pressable onPress={handleToggle}>
            <Ionicons name="chevron-up" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {isEditing || (!isRecording && text.length === 0) ? (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Paste your notes or script here..."
          placeholderTextColor={Colors.textMuted}
          multiline
          autoFocus={text.length === 0}
          onBlur={() => {
            if (text.length > 0) setIsEditing(false);
          }}
        />
      ) : text.length > 0 ? (
        <View style={styles.scrollContainer}>
          {activelyScrolling && <View style={styles.fadeTop} />}
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!activelyScrolling}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.promptText, activelyScrolling && styles.promptTextActive]}>
              {text}
            </Text>
            <View style={{ height: 120 }} />
          </ScrollView>
          {activelyScrolling && <View style={styles.fadeBottom} />}
          {activelyScrolling && <View style={styles.readLine} />}
        </View>
      ) : (
        <Text style={styles.emptyHint}>Tap to add your script or notes</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  collapsedLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  container: {
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.12)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLabel: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  input: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingBottom: 14,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  scrollContainer: {
    height: 100,
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  promptText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontFamily: 'DMSans_500Medium',
    lineHeight: 26,
  },
  promptTextActive: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 18,
    lineHeight: 30,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 2,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 2,
  },
  readLine: {
    position: 'absolute',
    top: '45%',
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: Colors.accent,
    opacity: 0.4,
    zIndex: 3,
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
    paddingBottom: 14,
  },
});
