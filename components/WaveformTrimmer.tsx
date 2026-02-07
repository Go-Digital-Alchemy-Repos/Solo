import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, PanResponder, Dimensions, LayoutChangeEvent } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import Colors from '@/constants/colors';

const HANDLE_WIDTH = 20;
const BAR_COUNT = 80;
const BAR_GAP = 1.5;
const MIN_SELECTION_MS = 5000;

interface WaveformTrimmerProps {
  audioUri: string;
  durationMs: number;
  onConfirm: (trimStartMs: number, trimEndMs: number) => void;
  onDiscard: () => void;
}

function generateWaveformData(count: number, seed: number): number[] {
  const data: number[] = [];
  let val = 0.5;
  for (let i = 0; i < count; i++) {
    const noise = Math.sin(i * 0.3 + seed) * 0.2 + Math.sin(i * 0.7 + seed * 2) * 0.15 + Math.sin(i * 1.1 + seed * 0.5) * 0.1;
    val = Math.max(0.08, Math.min(1, val + noise));
    const envelope = Math.sin((i / count) * Math.PI) * 0.4 + 0.6;
    data.push(val * envelope);
  }
  return data;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WaveformTrimmer({ audioUri, durationMs, onConfirm, onDiscard }: WaveformTrimmerProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const trackWidth = containerWidth - HANDLE_WIDTH * 2;

  const [trimStartFrac, setTrimStartFrac] = useState(0);
  const [trimEndFrac, setTrimEndFrac] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHapticRef = useRef(0);
  const startFracOnGrant = useRef(0);
  const endFracOnGrant = useRef(1);

  const waveformData = useMemo(() => generateWaveformData(BAR_COUNT, audioUri.length), [audioUri]);

  const trimStartMs = trimStartFrac * durationMs;
  const trimEndMs = trimEndFrac * durationMs;
  const selectionMs = trimEndMs - trimStartMs;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS === 'web') return;
    const now = Date.now();
    if (now - lastHapticRef.current > 40) {
      lastHapticRef.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const stopPreview = useCallback(async () => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackPos(0);
  }, []);

  const startPreview = useCallback(async () => {
    await stopPreview();

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { positionMillis: Math.round(trimStartMs), shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);

      playbackIntervalRef.current = setInterval(async () => {
        if (!soundRef.current) return;
        try {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            const pos = status.positionMillis;
            setPlaybackPos(pos);
            if (pos >= trimEndMs || !status.isPlaying) {
              await soundRef.current.setPositionAsync(Math.round(trimStartMs));
              await soundRef.current.playAsync();
            }
          }
        } catch {}
      }, 100);
    } catch (e) {
      console.error('Preview playback failed:', e);
      setIsPlaying(false);
    }
  }, [audioUri, trimStartMs, trimEndMs, stopPreview]);

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const leftHandleResponder = useMemo(() => {
    if (trackWidth <= 0) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startFracOnGrant.current = trimStartFrac;
        triggerHaptic();
      },
      onPanResponderMove: (_, gestureState) => {
        const fracDelta = gestureState.dx / trackWidth;
        let newStart = Math.max(0, startFracOnGrant.current + fracDelta);
        const maxStart = trimEndFrac - (MIN_SELECTION_MS / durationMs);
        newStart = Math.min(newStart, maxStart);
        setTrimStartFrac(newStart);
        triggerHaptic();
      },
      onPanResponderRelease: () => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    });
  }, [trackWidth, trimStartFrac, trimEndFrac, durationMs, triggerHaptic]);

  const rightHandleResponder = useMemo(() => {
    if (trackWidth <= 0) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        endFracOnGrant.current = trimEndFrac;
        triggerHaptic();
      },
      onPanResponderMove: (_, gestureState) => {
        const fracDelta = gestureState.dx / trackWidth;
        let newEnd = Math.min(1, endFracOnGrant.current + fracDelta);
        const minEnd = trimStartFrac + (MIN_SELECTION_MS / durationMs);
        newEnd = Math.max(newEnd, minEnd);
        setTrimEndFrac(newEnd);
        triggerHaptic();
      },
      onPanResponderRelease: () => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    });
  }, [trackWidth, trimStartFrac, trimEndFrac, durationMs, triggerHaptic]);

  const playbackFrac = durationMs > 0 ? playbackPos / durationMs : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trim Your Recording</Text>
      <Text style={styles.subheading}>Drag the yellow handles to select the part you want to keep</Text>

      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>{formatTime(trimStartMs)}</Text>
        <Text style={styles.selectionLabel}>Selected: {formatTime(selectionMs)}</Text>
        <Text style={styles.timeLabel}>{formatTime(trimEndMs)}</Text>
      </View>

      <View style={styles.trimmerContainer} onLayout={onLayout}>
        {containerWidth > 0 && (
          <>
            <View style={[styles.dimOverlay, { left: 0, width: HANDLE_WIDTH + trimStartFrac * trackWidth }]} />
            <View style={[styles.dimOverlay, { right: 0, width: HANDLE_WIDTH + (1 - trimEndFrac) * trackWidth }]} />

            <View
              style={[styles.handle, styles.handleLeft, { left: trimStartFrac * trackWidth }]}
              {...(leftHandleResponder?.panHandlers || {})}
            >
              <View style={styles.handleGrip} />
              <View style={styles.handleGrip} />
              <View style={styles.handleGrip} />
            </View>

            <View
              style={[styles.handle, styles.handleRight, { left: HANDLE_WIDTH + trimEndFrac * trackWidth }]}
              {...(rightHandleResponder?.panHandlers || {})}
            >
              <View style={styles.handleGrip} />
              <View style={styles.handleGrip} />
              <View style={styles.handleGrip} />
            </View>

            <View style={[styles.selectionBorder, {
              left: trimStartFrac * trackWidth + HANDLE_WIDTH,
              width: (trimEndFrac - trimStartFrac) * trackWidth,
            }]} />

            <View style={styles.waveformContainer}>
              {waveformData.map((amp, i) => {
                const barFrac = i / BAR_COUNT;
                const isInSelection = barFrac >= trimStartFrac && barFrac <= trimEndFrac;
                const isAtPlayback = isPlaying && Math.abs(barFrac - playbackFrac) < (1.5 / BAR_COUNT);
                return (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      {
                        height: 8 + amp * 72,
                        backgroundColor: isAtPlayback
                          ? '#FFFFFF'
                          : isInSelection
                            ? Colors.accent
                            : 'rgba(255, 215, 0, 0.2)',
                      },
                    ]}
                  />
                );
              })}
            </View>

            {isPlaying && playbackFrac >= trimStartFrac && playbackFrac <= trimEndFrac && (
              <View style={[styles.playhead, { left: HANDLE_WIDTH + playbackFrac * trackWidth }]} />
            )}
          </>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={isPlaying ? stopPreview : startPreview}
          style={styles.playBtn}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={28} color={Colors.bg} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onDiscard} style={styles.discardBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textDim} />
          <Text style={styles.discardText}>Re-record</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            stopPreview();
            onConfirm(trimStartMs, trimEndMs);
          }}
          style={styles.confirmBtn}
        >
          <Ionicons name="checkmark" size={20} color={Colors.bg} />
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  heading: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
  },
  subheading: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  timeLabel: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    fontVariant: ['tabular-nums'],
  },
  selectionLabel: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
  trimmerContainer: {
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  waveformContainer: {
    position: 'absolute',
    left: HANDLE_WIDTH,
    right: HANDLE_WIDTH,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    paddingHorizontal: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 1.5,
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 5,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    backgroundColor: Colors.accent,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  handleLeft: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  handleRight: {
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  handleGrip: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  selectionBorder: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.accent,
    zIndex: 4,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    zIndex: 8,
  },
  controls: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 'auto',
    paddingBottom: 20,
  },
  discardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  discardText: {
    color: Colors.textDim,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  confirmText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
});
