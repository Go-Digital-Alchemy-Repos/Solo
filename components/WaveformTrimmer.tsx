import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, PanResponder, LayoutChangeEvent, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';
import type { TranscriptWord } from '@/lib/data-context';

const HANDLE_WIDTH = 20;
const BAR_COUNT = 80;
const BAR_GAP = 1.5;
const MIN_SELECTION_MS = 5000;
const HANDLE_HIT_SLOP = 24;

const CATEGORY_OPTIONS = [
  'Sports', 'Politics', 'Business', 'Religion', 'Pop Culture',
  'Tech', 'Lifestyle', 'Music', 'Comedy', 'Health', 'News', 'Education',
];

interface Vibe {
  id: string;
  label: string;
  icon: string;
}

const VIBES: Vibe[] = [
  { id: 'coffee-shop', label: 'Coffee Shop', icon: 'coffee' },
  { id: 'nature', label: 'Nature', icon: 'tree' },
  { id: 'lofi-beat', label: 'Lofi Beat', icon: 'music' },
];

interface WaveformTrimmerProps {
  audioUri: string;
  durationMs: number;
  onCancel: () => void;
  onPost: (title: string, trimStartMs: number, trimEndMs: number, tags: string[], vibeId: string | null) => void;
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
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const [containerWidth, setContainerWidth] = useState(0);
  const trackWidth = containerWidth - HANDLE_WIDTH * 2;

  const [trimStartFrac, setTrimStartFrac] = useState(0);
  const [trimEndFrac, setTrimEndFrac] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [title, setTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeExpanded, setVibeExpanded] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const vibeSoundRef = useRef<Audio.Sound | null>(null);
  const vibePreviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHapticRef = useRef(0);
  const startFracOnGrant = useRef(0);
  const endFracOnGrant = useRef(1);
  const trimStartFracRef = useRef(0);
  const trimEndFracRef = useRef(1);
  const isDraggingRef = useRef<'left' | 'right' | 'scrub' | null>(null);

  useEffect(() => { trimStartFracRef.current = trimStartFrac; }, [trimStartFrac]);
  useEffect(() => { trimEndFracRef.current = trimEndFrac; }, [trimEndFrac]);

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

  const stopVibePlayback = useCallback(async () => {
    if (vibeSoundRef.current) {
      try {
        await vibeSoundRef.current.stopAsync();
        await vibeSoundRef.current.unloadAsync();
      } catch {}
      vibeSoundRef.current = null;
    }
  }, []);

  const startVibePlayback = useCallback(async (vibeId: string) => {
    await stopVibePlayback();
    try {
      const baseUrl = getApiUrl();
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${baseUrl}api/vibes/${vibeId}/audio` },
        { shouldPlay: true, isLooping: true, volume: 0.15 }
      );
      vibeSoundRef.current = sound;
    } catch (e) {
      console.error('Failed to play vibe:', e);
    }
  }, [stopVibePlayback]);

  const cleanupPlayback = useCallback(async () => {
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
    await stopVibePlayback();
    setIsPlaying(false);
  }, [stopVibePlayback]);

  const startPlaybackInterval = useCallback(() => {
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    playbackIntervalRef.current = setInterval(async () => {
      if (!soundRef.current) return;
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          const pos = status.positionMillis;
          setPlaybackPos(pos);
          const endMs = trimEndFracRef.current * durationMs;
          if (pos >= endMs || !status.isPlaying) {
            const startMs = trimStartFracRef.current * durationMs;
            await soundRef.current.setPositionAsync(Math.round(startMs));
            await soundRef.current.playAsync();
          }
        }
      } catch {}
    }, 80);
  }, [durationMs]);

  const seekToPosition = useCallback(async (posMs: number) => {
    try {
      if (!soundRef.current) {
        if (vibePreviewTimeoutRef.current) {
          clearTimeout(vibePreviewTimeoutRef.current);
          vibePreviewTimeoutRef.current = null;
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { positionMillis: Math.round(posMs), shouldPlay: true }
        );
        soundRef.current = sound;
        setIsPlaying(true);
        startPlaybackInterval();
        if (selectedVibe) {
          startVibePlayback(selectedVibe);
        }
      } else {
        await soundRef.current.setPositionAsync(Math.round(posMs));
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && !status.isPlaying) {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          startPlaybackInterval();
        }
      }
      setPlaybackPos(posMs);
    } catch (e) {
      console.error('Seek failed:', e);
    }
  }, [audioUri, startPlaybackInterval, selectedVibe, startVibePlayback]);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await cleanupPlayback();
      return;
    }
    if (vibePreviewTimeoutRef.current) {
      clearTimeout(vibePreviewTimeoutRef.current);
      vibePreviewTimeoutRef.current = null;
    }
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { positionMillis: Math.round(trimStartMs), shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      startPlaybackInterval();
      if (selectedVibe) {
        startVibePlayback(selectedVibe);
      }
    } catch (e) {
      console.error('Preview playback failed:', e);
      setIsPlaying(false);
    }
  }, [isPlaying, audioUri, trimStartMs, cleanupPlayback, startPlaybackInterval, selectedVibe, startVibePlayback]);

  useEffect(() => {
    return () => {
      if (vibePreviewTimeoutRef.current) clearTimeout(vibePreviewTimeoutRef.current);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (vibeSoundRef.current) {
        vibeSoundRef.current.stopAsync().catch(() => {});
        vibeSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const getTouchTarget = useCallback((locationX: number): 'left' | 'right' | 'scrub' => {
    if (trackWidth <= 0) return 'scrub';
    const leftHandleCenter = trimStartFracRef.current * trackWidth + HANDLE_WIDTH / 2;
    const rightHandleCenter = HANDLE_WIDTH + trimEndFracRef.current * trackWidth + HANDLE_WIDTH / 2;

    const distLeft = Math.abs(locationX - leftHandleCenter);
    const distRight = Math.abs(locationX - rightHandleCenter);

    if (distLeft < HANDLE_HIT_SLOP && distLeft <= distRight) return 'left';
    if (distRight < HANDLE_HIT_SLOP) return 'right';
    return 'scrub';
  }, [trackWidth]);

  const unifiedResponder = useMemo(() => {
    if (trackWidth <= 0) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2,
      onPanResponderGrant: (evt) => {
        const touchX = evt.nativeEvent.locationX;
        const target = getTouchTarget(touchX);
        isDraggingRef.current = target;

        if (target === 'left') {
          startFracOnGrant.current = trimStartFracRef.current;
          triggerHaptic();
        } else if (target === 'right') {
          endFracOnGrant.current = trimEndFracRef.current;
          triggerHaptic();
        } else {
          const totalWidth = trackWidth + HANDLE_WIDTH * 2;
          const frac = Math.max(trimStartFracRef.current, Math.min(trimEndFracRef.current, touchX / totalWidth));
          seekToPosition(frac * durationMs);
          triggerHaptic();
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const target = isDraggingRef.current;
        if (target === 'left') {
          const fracDelta = gestureState.dx / trackWidth;
          let newStart = Math.max(0, startFracOnGrant.current + fracDelta);
          const maxStart = trimEndFracRef.current - (MIN_SELECTION_MS / durationMs);
          newStart = Math.min(newStart, maxStart);
          setTrimStartFrac(newStart);
          triggerHaptic();
        } else if (target === 'right') {
          const fracDelta = gestureState.dx / trackWidth;
          let newEnd = Math.min(1, endFracOnGrant.current + fracDelta);
          const minEnd = trimStartFracRef.current + (MIN_SELECTION_MS / durationMs);
          newEnd = Math.max(newEnd, minEnd);
          setTrimEndFrac(newEnd);
          triggerHaptic();
        } else {
          const touchX = evt.nativeEvent.locationX;
          const totalWidth = trackWidth + HANDLE_WIDTH * 2;
          const frac = Math.max(trimStartFracRef.current, Math.min(trimEndFracRef.current, touchX / totalWidth));
          seekToPosition(frac * durationMs);
        }
      },
      onPanResponderRelease: () => {
        if (isDraggingRef.current === 'left' || isDraggingRef.current === 'right') {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
        isDraggingRef.current = null;
      },
    });
  }, [trackWidth, durationMs, seekToPosition, triggerHaptic, getTouchTarget]);

  const playbackFrac = durationMs > 0 ? playbackPos / durationMs : 0;
  const playbackSec = playbackPos / 1000;

  const transcriptBubbleText = useMemo(() => {
    if (!transcript?.words || transcript.words.length === 0) return '';
    if (!isPlaying) return '';
    return getWordsNearPosition(transcript.words, playbackSec);
  }, [transcript, playbackSec, isPlaying]);

  const bubbleLeftPx = HANDLE_WIDTH + playbackFrac * trackWidth;

  const toggleTag = useCallback((tag: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleVibeSelect = useCallback(async (vibeId: string | null) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (vibePreviewTimeoutRef.current) {
      clearTimeout(vibePreviewTimeoutRef.current);
      vibePreviewTimeoutRef.current = null;
    }
    if (vibeId === null || selectedVibe === vibeId) {
      setSelectedVibe(null);
      await stopVibePlayback();
    } else {
      setSelectedVibe(vibeId);
      if (isPlaying) {
        await startVibePlayback(vibeId);
      } else {
        await startVibePlayback(vibeId);
        vibePreviewTimeoutRef.current = setTimeout(() => {
          stopVibePlayback();
          vibePreviewTimeoutRef.current = null;
        }, 3000);
      }
    }
  }, [selectedVibe, isPlaying, startVibePlayback, stopVibePlayback]);

  const getVibeIcon = (iconName: string) => {
    switch (iconName) {
      case 'coffee': return <MaterialCommunityIcons name="coffee" size={16} color={Colors.accent} />;
      case 'tree': return <Ionicons name="leaf" size={16} color="#4CAF50" />;
      case 'music': return <MaterialCommunityIcons name="music-note" size={16} color="#9C27B0" />;
      default: return <Ionicons name="musical-note" size={16} color={Colors.textDim} />;
    }
  };

  const canPost = title.trim().length > 0 && selectionMs >= MIN_SELECTION_MS && !isPosting;

  const handlePost = useCallback(() => {
    if (!canPost) return;
    cleanupPlayback();
    onPost(title.trim(), trimStartMs, trimEndMs, selectedTags, selectedVibe);
  }, [canPost, cleanupPlayback, onPost, title, trimStartMs, trimEndMs, selectedTags, selectedVibe]);

  const handleCancel = useCallback(() => {
    cleanupPlayback();
    onCancel();
  }, [cleanupPlayback, onCancel]);

  const selectedVibeLabel = VIBES.find(v => v.id === selectedVibe)?.label;

  return (
    <ScrollView style={[styles.container, { paddingTop: topInset }]} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={handleCancel} style={styles.cancelBtn} hitSlop={16}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit</Text>
        <Pressable
          onPress={handlePost}
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          disabled={!canPost}
          hitSlop={16}
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
          left: Math.max(36, Math.min(containerWidth - 144, bubbleLeftPx - 64)),
        }]}>
          <Text style={styles.transcriptBubbleText} numberOfLines={2}>
            {transcriptBubbleText}
          </Text>
        </View>
      )}

      <View style={styles.trimmerOuter}>
        <View style={styles.trimmerContainer} onLayout={onLayout}>
          {containerWidth > 0 && (
            <View style={styles.waveformTouchArea} {...(unifiedResponder?.panHandlers || {})}>
              <View style={[styles.dimOverlay, { left: 0, width: HANDLE_WIDTH + trimStartFrac * trackWidth }]} />
              <View style={[styles.dimOverlay, { right: 0, width: HANDLE_WIDTH + (1 - trimEndFrac) * trackWidth }]} />

              <View
                style={[styles.handle, styles.handleLeft, { left: trimStartFrac * trackWidth }]}
              >
                <View style={styles.handleGrip} />
                <View style={styles.handleGrip} />
                <View style={styles.handleGrip} />
              </View>

              <View
                style={[styles.handle, styles.handleRight, { left: HANDLE_WIDTH + trimEndFrac * trackWidth }]}
              >
                <View style={styles.handleGrip} />
                <View style={styles.handleGrip} />
                <View style={styles.handleGrip} />
              </View>

              <View style={[styles.selectionBorder, {
                left: trimStartFrac * trackWidth + HANDLE_WIDTH,
                width: (trimEndFrac - trimStartFrac) * trackWidth,
              }]} />

              <View style={styles.barsContainer}>
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
            </View>
          )}
        </View>
        <Text style={styles.scrubHint}>Drag handles to trim, tap waveform to scrub</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={togglePlayPause}
          style={styles.playPauseBtn}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={30} color={Colors.bg} />
        </Pressable>
        <Text style={styles.previewLabel}>{isPlaying ? 'Playing' : 'Preview'}</Text>
      </View>

      <View style={styles.vibeSection}>
        {!vibeExpanded ? (
          <Pressable onPress={() => setVibeExpanded(true)} style={styles.vibeCollapsed}>
            <Ionicons name="musical-notes-outline" size={16} color={selectedVibe ? Colors.accent : Colors.textDim} />
            <Text style={[styles.vibeCollapsedLabel, selectedVibe && { color: Colors.accent }]}>
              {selectedVibe ? selectedVibeLabel : 'Add Background Vibe'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </Pressable>
        ) : (
          <View style={styles.vibePanel}>
            <View style={styles.vibePanelHeader}>
              <View style={styles.vibePanelHeaderLeft}>
                <Ionicons name="musical-notes" size={16} color={Colors.accent} />
                <Text style={styles.vibePanelTitle}>Background Vibes</Text>
              </View>
              <Pressable onPress={() => setVibeExpanded(false)}>
                <Ionicons name="chevron-up" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.vibeSubtitle}>Mixed at 10% volume behind your voice</Text>
            <View style={styles.vibeRow}>
              <Pressable
                onPress={() => handleVibeSelect(null)}
                style={[styles.vibeChip, !selectedVibe && styles.vibeChipActive]}
              >
                <Ionicons name="volume-mute" size={14} color={!selectedVibe ? Colors.bg : Colors.textDim} />
                <Text style={[styles.vibeChipText, !selectedVibe && styles.vibeChipTextActive]}>None</Text>
              </Pressable>
              {VIBES.map(vibe => {
                const isSelected = selectedVibe === vibe.id;
                return (
                  <Pressable
                    key={vibe.id}
                    onPress={() => handleVibeSelect(vibe.id)}
                    style={[styles.vibeChip, isSelected && styles.vibeChipActive]}
                  >
                    {getVibeIcon(vibe.icon)}
                    <Text style={[styles.vibeChipText, isSelected && styles.vibeChipTextActive]}>{vibe.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View style={styles.tagSection}>
        <Text style={styles.tagLabel}>Topics</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScroll}>
          {CATEGORY_OPTIONS.map(tag => {
            const isSelected = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[styles.tagChip, isSelected && styles.tagChipActive]}
              >
                <Text style={[styles.tagChipText, isSelected && styles.tagChipTextActive]}>
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelText: {
    color: Colors.textDim,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: 'DMSans_700Bold',
  },
  postBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
  },
  postBtnDisabled: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
  },
  postBtnText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  postBtnTextDisabled: {
    color: 'rgba(0, 0, 0, 0.3)',
  },
  titleInput: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
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
    top: 175,
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
    height: 140,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  waveformTouchArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  barsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    paddingHorizontal: HANDLE_WIDTH + 4,
    pointerEvents: 'none' as any,
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
    zIndex: 1,
    pointerEvents: 'none' as any,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    backgroundColor: Colors.accent,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    pointerEvents: 'none' as any,
  },
  handleLeft: {
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  handleRight: {
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
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
    zIndex: 1,
    pointerEvents: 'none' as any,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    zIndex: 3,
    pointerEvents: 'none' as any,
  },
  scrubHint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
  controls: {
    alignItems: 'center',
    marginTop: 24,
    gap: 6,
  },
  playPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  vibeSection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  vibeCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vibeCollapsedLabel: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
  },
  vibePanel: {
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.12)',
    padding: 14,
    gap: 8,
  },
  vibePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vibePanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vibePanelTitle: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  vibeSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
  vibeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  vibeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vibeChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  vibeChipText: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  vibeChipTextActive: {
    color: Colors.bg,
    fontFamily: 'DMSans_700Bold',
  },
  tagSection: {
    marginTop: 16,
    gap: 6,
  },
  tagLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
    paddingHorizontal: 16,
  },
  tagScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tagChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tagChipText: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  tagChipTextActive: {
    color: Colors.bg,
    fontFamily: 'DMSans_700Bold',
  },
});
