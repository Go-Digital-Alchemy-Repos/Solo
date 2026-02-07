import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface TeleprompterProps {
  isRecording: boolean;
  isPaused: boolean;
}

const MIN_SPEED = 10;
const MAX_SPEED = 80;
const DEFAULT_SPEED = 30;

export default function Teleprompter({ isRecording, isPaused }: TeleprompterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [showSpeedSlider, setShowSpeedSlider] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sliderWidthRef = useRef(0);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isRecording && !isPaused && text.length > 0 && isExpanded && autoScroll) {
      intervalRef.current = setInterval(() => {
        scrollY.current += speed / 60;
        scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });
      }, 1000 / 60);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRecording, isPaused, text, isExpanded, autoScroll, speed]);

  useEffect(() => {
    if (!isRecording && !isPaused) {
      scrollY.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isRecording, isPaused]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleSpeedSliderGesture = useCallback((locationX: number) => {
    if (sliderWidthRef.current <= 0) return;
    const frac = Math.max(0, Math.min(1, locationX / sliderWidthRef.current));
    const newSpeed = Math.round(MIN_SPEED + frac * (MAX_SPEED - MIN_SPEED));
    setSpeed(newSpeed);
  }, []);

  const speedFrac = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);

  if (!isExpanded) {
    return (
      <Pressable onPress={handleToggle} style={styles.collapsedContainer}>
        <Ionicons name="document-text-outline" size={16} color={Colors.textDim} />
        <Text style={styles.collapsedLabel}>Teleprompter</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
      </Pressable>
    );
  }

  const activelyScrolling = isRecording && !isPaused && text.length > 0 && autoScroll;
  const isActiveSession = isRecording || isPaused;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="document-text" size={16} color={Colors.accent} />
          <Text style={styles.headerLabel}>Teleprompter</Text>
        </View>
        <View style={styles.headerRight}>
          {text.length > 0 && !isActiveSession && (
            <Pressable onPress={() => setIsEditing(!isEditing)} style={styles.iconBtn} hitSlop={10}>
              <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={18} color={Colors.accent} />
            </Pressable>
          )}
          <Pressable onPress={handleToggle} style={styles.iconBtn} hitSlop={10}>
            <Ionicons name="chevron-up" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {isEditing || (!isActiveSession && text.length === 0) ? (
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
        <View style={styles.scrollOuter}>
          <View style={styles.scrollContainer}>
            {activelyScrolling && <View style={styles.fadeTop} />}
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!activelyScrolling}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={{ height: 60 }} />
              <Text style={styles.promptText}>
                {text}
              </Text>
              <View style={{ height: 160 }} />
            </ScrollView>
            {activelyScrolling && <View style={styles.fadeBottom} />}
            <View style={styles.focusLine} />
          </View>
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={24} color={Colors.textMuted} />
          <Text style={styles.emptyHint}>Tap to add your script or notes</Text>
        </View>
      )}

      <View style={styles.controlsBar}>
        <Pressable
          onPress={() => setAutoScroll(!autoScroll)}
          style={[styles.toggleBtn, autoScroll && styles.toggleBtnActive]}
          hitSlop={8}
        >
          <Ionicons
            name={autoScroll ? "play-circle" : "play-circle-outline"}
            size={16}
            color={autoScroll ? Colors.bg : Colors.textDim}
          />
          <Text style={[styles.toggleText, autoScroll && styles.toggleTextActive]}>
            Auto
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowSpeedSlider(!showSpeedSlider)}
          style={[styles.toggleBtn, showSpeedSlider && styles.toggleBtnActive]}
          hitSlop={8}
        >
          <Ionicons
            name="speedometer-outline"
            size={16}
            color={showSpeedSlider ? Colors.bg : Colors.textDim}
          />
          <Text style={[styles.toggleText, showSpeedSlider && styles.toggleTextActive]}>
            Speed
          </Text>
        </Pressable>

        {showSpeedSlider && (
          <View style={styles.sliderContainer}>
            <View
              style={styles.sliderTrack}
              onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => handleSpeedSliderGesture(e.nativeEvent.locationX)}
              onResponderMove={(e) => handleSpeedSliderGesture(e.nativeEvent.locationX)}
            >
              <View style={[styles.sliderFill, { width: `${speedFrac * 100}%` }]} />
              <View style={[styles.sliderThumb, { left: `${speedFrac * 100}%` }]} />
            </View>
            <Text style={styles.speedLabel}>{speed}px/s</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  collapsedLabel: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
  },
  container: {
    backgroundColor: 'rgba(255, 215, 0, 0.03)',
    borderRadius: 18,
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
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  input: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 28,
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 100,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
  scrollOuter: {
    paddingHorizontal: 8,
  },
  scrollContainer: {
    height: 160,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  promptText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 20,
    fontFamily: 'DMSans_500Medium',
    lineHeight: 32,
    textAlign: 'center',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 2,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 2,
  },
  focusLine: {
    position: 'absolute',
    top: '45%',
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: Colors.accent,
    opacity: 0.5,
    zIndex: 3,
    borderRadius: 1,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.08)',
    flexWrap: 'wrap',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  toggleText: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
  },
  toggleTextActive: {
    color: Colors.bg,
  },
  sliderContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 100,
  },
  sliderTrack: {
    flex: 1,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 215, 0, 0.25)',
    borderRadius: 12,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    marginLeft: -9,
    top: 3,
  },
  speedLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    fontVariant: ['tabular-nums'],
    minWidth: 38,
  },
});
