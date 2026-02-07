import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, PanResponder, LayoutChangeEvent, TextInput } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import type { TranscriptWord } from '@/lib/data-context';

const HANDLE_WIDTH = 20;
const BAR_COUNT = 80;
const BAR_GAP = 1.5;
const MIN_SELECTION_MS = 5000;

interface WaveformTrimmerProps {
  audioUri: string;
  durationMs: number;
  onCancel: () => void;
  onPost: (title: string, trimStartMs: number, trimEndMs: number) => void;
  isPosting: boolean;
  transcript?: { text: string; words: TranscriptWord[] } | null;
  segmentMarkers?: number[];
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

function getWordsNearPosition(words: TranscriptWord[], positionSec: number, windowSec: number = 1.5): string {
  if (!words || words.length === 0) return '';
  const nearby = words.filter(w => w.start >= positionSec - windowSec && w.start <= positionSec + windowSec);
  if (nearby.length === 0) {
    const closest = words.reduce((prev, curr) =>
      Math.abs(curr.start - positionSec) < Math.abs(prev.start - positionSec) ? curr : prev
    );
    const idx = words.indexOf(closest);
    const start = Math.max(0, idx - 2);
    const end = Math.min(words.length, idx + 3);
    return words.slice(start, end).map(w => w.word).join(' ');
  }
  return nearby.map(w => w.word).join(' ');
}

export default function WaveformTrimmer({ audioUri, durationMs, onCancel, onPost, isPosting, transcript, segmentMarkers }: WaveformTrimmerProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const trackWidth = containerWidth - HANDLE_WIDTH * 2;

  const [trimStartFrac, setTrimStartFrac] = useState(0);
  const [trimEndFrac, setTrimEndFrac] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [title, setTitle] = useState('');

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
  }, []);

  const ensureSoundLoaded = useCallback(async (): Promise<Audio.Sound> => {
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) return soundRef.current;
      } catch {}
      try {
        await soundRef.current.unloadAsync();
      } catch {}
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUri },
      { shouldPlay: false }
    );
    soundRef.current = sound;
    return sound;
  }, [audioUri]);

  const seekToPosition = useCallback(async (posMs: number) => {
    try {
      const sound = await ensureSoundLoaded();
      await sound.setPositionAsync(Math.round(posMs));
      setPlaybackPos(posMs);
      if (!isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
        if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = setInterval(async () => {
          if (!soundRef.current) return;
          try {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
              const pos = status.positionMillis;
              setPlaybackPos(pos);
              if (pos >= trimEndFrac * durationMs || !status.isPlaying) {
                await soundRef.current.setPositionAsync(Math.round(trimStartFrac * durationMs));
                await soundRef.current.playAsync();
              }
            }
          } catch {}
        }, 80);
      }
    } catch (e) {
      console.error('Seek failed:', e);
    }
  }, [ensureSoundLoaded, isPlaying, trimStartFrac, trimEndFrac, durationMs]);

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
      }, 80);
    } catch (e) {
      console.error('Preview playback failed:', e);
      setIsPlaying(false);
    }
  }, [audioUri, trimStartMs, trimEndMs, stopPreview]);

  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
      }
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

  const scrubResponder = useMemo(() => {
    if (trackWidth <= 0) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3,
      onPanResponderGrant: (evt) => {
        const touchX = evt.nativeEvent.locationX - HANDLE_WIDTH;
        const frac = Math.max(0, Math.min(1, touchX / trackWidth));
        const posMs = frac * durationMs;
        seekToPosition(posMs);
        triggerHaptic();
      },
      onPanResponderMove: (evt) => {
        const touchX = evt.nativeEvent.locationX - HANDLE_WIDTH;
        const frac = Math.max(0, Math.min(1, touchX / trackWidth));
        const posMs = frac * durationMs;
        seekToPosition(posMs);
      },
      onPanResponderRelease: () => {},
    });
  }, [trackWidth, durationMs, seekToPosition, triggerHaptic]);

  const playbackFrac = durationMs > 0 ? playbackPos / durationMs : 0;
  const playbackSec = playbackPos / 1000;

  const transcriptBubbleText = useMemo(() => {
    if (!transcript?.words || transcript.words.length === 0) return '';
    if (!isPlaying) return '';
    return getWordsNearPosition(transcript.words, playbackSec);
  }, [transcript, playbackSec, isPlaying]);

  const bubbleLeftPx = HANDLE_WIDTH + playbackFrac * trackWidth;
  const canPost = title.trim().length > 0 && selectionMs >= MIN_SELECTION_MS && !isPosting;

  const handlePost = useCallback(() => {
    if (!canPost) return;
    stopPreview();
    onPost(title.trim(), trimStartMs, trimEndMs);
  }, [canPost, stopPreview, onPost, title, trimStartMs, trimEndMs]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => { stopPreview(); onCancel(); }} style={styles.cancelBtn} hitSlop={12}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit</Text>
        <Pressable
          onPress={handlePost}
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          disabled={!canPost}
          hitSlop={12}
        >
          <Text style={[styles.postBtnText, !canPost && styles.postBtnTextDisabled]}>Post</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="Title your Solo..."
        placeholderTextColor={Colors.textMuted}
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        returnKeyType="done"
      />

      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>{formatTime(trimStartMs)}</Text>
        <Text style={styles.selectionLabel}>{formatTime(selectionMs)}</Text>
        <Text style={styles.timeLabel}>{formatTime(trimEndMs)}</Text>
      </View>

      {isPlaying && transcriptBubbleText.length > 0 && containerWidth > 0 && (
        <View style={[styles.transcriptBubble, {
          left: Math.max(20, Math.min(containerWidth - 180, bubbleLeftPx - 80)),
        }]}>
          <Text style={styles.transcriptBubbleText} numberOfLines={2}>
            {transcriptBubbleText}
          </Text>
        </View>
      )}

      <View style={styles.trimmerOuter}>
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

              <View
                style={styles.waveformContainer}
                {...(scrubResponder?.panHandlers || {})}
              >
                {waveformData.map((amp, i) => {
                  const barFrac = i / BAR_COUNT;
                  const isInSelection = barFrac >= trimStartFrac && barFrac <= trimEndFrac;
                  const isAtPlayback = isPlaying && Math.abs(barFrac - playbackFrac) < (1.5 / BAR_COUNT);
                  const isSegmentBoundary = segmentMarkers && segmentMarkers.some(
                    marker => Math.abs(barFrac - marker / durationMs) < (1.2 / BAR_COUNT)
                  );
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        {
                          height: 8 + amp * 72,
                          backgroundColor: isSegmentBoundary
                            ? 'rgba(255, 68, 68, 0.6)'
                            : isAtPlayback
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

              {playbackFrac > 0 && (
                <View style={[styles.playhead, { left: HANDLE_WIDTH + playbackFrac * trackWidth }]} />
              )}
            </>
          )}
        </View>
        <Text style={styles.scrubHint}>Drag across waveform to scrub</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={isPlaying ? stopPreview : startPreview}
          style={styles.playPauseBtn}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={28} color={Colors.bg} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cancelText: {
    color: Colors.textDim,
    fontSize: 16,
    fontFamily: 'DMSans_500Medium',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: 'DMSans_700Bold',
  },
  postBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postBtnDisabled: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  postBtnText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  postBtnTextDisabled: {
    color: 'rgba(0, 0, 0, 0.4)',
  },
  titleInput: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.1)',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  timeLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    fontVariant: ['tabular-nums'],
  },
  selectionLabel: {
    color: Colors.accent,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    fontVariant: ['tabular-nums'],
  },
  transcriptBubble: {
    position: 'absolute',
    top: 155,
    width: 160,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
  },
  transcriptBubbleText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
    lineHeight: 17,
    textAlign: 'center',
  },
  trimmerOuter: {
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 6,
  },
  trimmerContainer: {
    height: 130,
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
  scrubHint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
  controls: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 24,
  },
  playPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
