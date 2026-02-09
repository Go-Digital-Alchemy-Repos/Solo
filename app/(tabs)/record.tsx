import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import SoloHeader from '@/components/SoloHeader';
import WaveformTrimmer from '@/components/WaveformTrimmer';
import Teleprompter from '@/components/Teleprompter';
import { useData } from '@/lib/data-context';

const MAX_DURATION_MS = 300000;
const MIN_DURATION_MS = 15000;

type RecordPhase = 'idle' | 'recording' | 'paused' | 'editing' | 'processing';

function LiveBar({ index, isRecording }: { index: number; isRecording: boolean }) {
  const height = useSharedValue(8);

  useEffect(() => {
    if (isRecording) {
      height.value = withRepeat(
        withSequence(
          withTiming(10 + Math.random() * 40, {
            duration: 150 + Math.random() * 150,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(5 + Math.random() * 15, {
            duration: 150 + Math.random() * 150,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
    } else {
      height.value = withTiming(8, { duration: 300 });
    }
  }, [isRecording]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 3,
          borderRadius: 1.5,
          backgroundColor: Colors.accent,
        },
        style,
      ]}
    />
  );
}

function ProcessingScreen() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.processingContainer}>
      <View style={styles.processingCircleWrap}>
        <Animated.View style={[styles.processingPulse, pulseStyle]} />
        <View style={styles.processingCircle}>
          <Ionicons name="cloud-upload" size={36} color={Colors.bg} />
        </View>
      </View>
      <Text style={styles.processingTitle}>Processing your Solo</Text>
      <Text style={styles.processingSubtitle}>Trimming, mixing & transcribing...</Text>
    </View>
  );
}

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uploadAndPost } = useData();
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [segmentCount, setSegmentCount] = useState(1);
  const [segmentMarkers, setSegmentMarkers] = useState<number[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    Audio.requestPermissionsAsync().then(({ granted }) => {
      setPermissionGranted(granted);
    });
  }, []);

  useEffect(() => {
    if (phase === 'recording') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 800 }),
          withTiming(0.3, { duration: 800 }),
        ),
        -1,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0.3, { duration: 200 });
    }
  }, [phase]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const resetAll = useCallback(() => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setPhase('idle');
    setSegmentCount(1);
    setSegmentMarkers([]);
    setIsPosting(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: 0,
        shouldDuckAndroid: true,
        interruptionModeAndroid: 1,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setPhase('recording');
      setRecordingDuration(0);
      setRecordedUri(null);
      setSegmentCount(1);
      setSegmentMarkers([]);

      intervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1000;
          if (next >= MAX_DURATION_MS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await recordingRef.current.pauseAsync();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSegmentMarkers(prev => [...prev, recordingDuration]);
      setPhase('paused');
    } catch (e) {
      console.error('Failed to pause recording:', e);
    }
  }, [recordingDuration]);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await recordingRef.current.startAsync();
      setSegmentCount(prev => prev + 1);
      setPhase('recording');

      intervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1000;
          if (next >= MAX_DURATION_MS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      console.error('Failed to resume recording:', e);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recordingRef.current.getURI();
      setRecordedUri(uri);
      setPhase('editing');
      recordingRef.current = null;
    } catch (e) {
      console.error('Failed to stop recording:', e);
      setPhase('idle');
    }
  }, []);

  const redoRecording = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    resetAll();
  }, [resetAll]);

  const handlePost = useCallback(async (title: string, trimStartMs: number, trimEndMs: number, tags: string[], vibeId: string | null) => {
    if (!recordedUri) return;
    const effectiveDuration = trimEndMs - trimStartMs;
    if (effectiveDuration < MIN_DURATION_MS) {
      Alert.alert('Too Short', 'Your selection must be at least 15 seconds.');
      return;
    }

    setIsPosting(true);
    setPhase('processing');

    try {
      await uploadAndPost({
        audioUri: recordedUri,
        title,
        durationMs: effectiveDuration,
        trimStartMs,
        trimEndMs,
        vibeId: vibeId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      resetAll();
      router.replace('/(tabs)/');
    } catch (e: any) {
      console.error('Failed to upload:', e?.message || e, e?.stack);
      setIsPosting(false);
      setPhase('editing');
      Alert.alert('Upload Failed', 'Could not upload your recording. Please try again.');
    }
  }, [recordedUri, uploadAndPost, resetAll]);

  const handleEditCancel = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (permissionGranted === false) {
    return (
      <View style={styles.container}>
        <SoloHeader />
        <View style={styles.permissionBox}>
          <Ionicons name="mic-off" size={48} color={Colors.accent} />
          <Text style={styles.permissionTitle}>Microphone Access Required</Text>
          <Text style={styles.permissionText}>
            Solo needs access to your microphone to record audio.
          </Text>
          <Pressable
            onPress={() => Audio.requestPermissionsAsync().then(({ granted }) => setPermissionGranted(granted))}
            style={styles.permissionBtn}
          >
            <Text style={styles.permissionBtnText}>Grant Access</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'processing') {
    return (
      <View style={styles.container}>
        <SoloHeader />
        <ProcessingScreen />
      </View>
    );
  }

  if (phase === 'editing' && recordedUri) {
    return (
      <View style={styles.container}>
        <WaveformTrimmer
          audioUri={recordedUri}
          durationMs={recordingDuration}
          onCancel={handleEditCancel}
          onPost={handlePost}
          isPosting={isPosting}
          segmentMarkers={segmentMarkers}
        />
      </View>
    );
  }

  const bars = Array.from({ length: 50 }, (_, i) => i);
  const isActiveRecording = phase === 'recording' || phase === 'paused';

  return (
    <View style={styles.container}>
      <SoloHeader />

      <View style={[styles.recordContainer, { paddingBottom: Platform.OS === 'web' ? 84 : Math.max(insets.bottom, 20) + 60 }]}>
        <View style={styles.toolsRow}>
          <Teleprompter
            isRecording={phase === 'recording'}
            isPaused={phase === 'paused'}
          />
        </View>

        <View style={styles.centerArea}>
          {isActiveRecording && segmentCount > 1 && (
            <View style={styles.segmentIndicator}>
              <MaterialCommunityIcons name="layers-outline" size={14} color={Colors.accent} />
              <Text style={styles.segmentText}>Segment {segmentCount}</Text>
            </View>
          )}

          <View style={styles.waveformLive}>
            {bars.map(i => (
              <LiveBar key={i} index={i} isRecording={phase === 'recording'} />
            ))}
          </View>

          <Text style={styles.timer}>{formatDuration(recordingDuration)}</Text>
          <Text style={styles.timerLabel}>
            {phase === 'recording' ? 'Recording...' : phase === 'paused' ? 'Paused' : 'Tap to start'}
          </Text>

          <View style={styles.controlsRow}>
            {isActiveRecording && (
              <Pressable onPress={redoRecording} style={styles.secondaryBtn}>
                <Ionicons name="refresh" size={24} color={Colors.danger} />
              </Pressable>
            )}

            <View style={styles.recBtnContainer}>
              <Animated.View style={[styles.recPulse, pulseStyle]} />
              {phase === 'idle' ? (
                <Pressable onPress={startRecording} style={styles.recBtn}>
                  <Ionicons name="mic" size={32} color={Colors.bg} />
                </Pressable>
              ) : phase === 'recording' ? (
                <Pressable onPress={pauseRecording} style={[styles.recBtn, styles.recBtnActive]}>
                  <Ionicons name="pause" size={28} color={Colors.bg} />
                </Pressable>
              ) : (
                <Pressable onPress={resumeRecording} style={styles.recBtn}>
                  <Ionicons name="mic" size={28} color={Colors.bg} />
                </Pressable>
              )}
            </View>

            {isActiveRecording && (
              <Pressable onPress={stopRecording} style={styles.doneBtn}>
                <Ionicons name="checkmark" size={22} color={Colors.accent} />
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.durationHint}>
            {phase === 'recording'
              ? `Max ${formatDuration(MAX_DURATION_MS)}`
              : phase === 'paused'
                ? 'Tap mic to resume, Done to edit & post'
                : `Min 15s / Max 5min`
            }
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  permissionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
  },
  permissionText: {
    color: Colors.textDim,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  permissionBtnText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  recordContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  toolsRow: {
    gap: 8,
    paddingTop: 8,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  segmentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.15)',
  },
  segmentText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
  },
  waveformLive: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 2,
    marginBottom: 16,
  },
  timer: {
    color: Colors.text,
    fontSize: 48,
    fontFamily: 'DMSans_700Bold',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 20,
  },
  recBtnContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recPulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accent,
  },
  recBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  recBtnActive: {
    backgroundColor: Colors.danger,
  },
  secondaryBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  doneBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  doneBtnText: {
    color: Colors.accent,
    fontSize: 9,
    fontFamily: 'DMSans_700Bold',
    marginTop: -2,
  },
  durationHint: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 16,
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 40,
  },
  processingCircleWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  processingPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.accent,
  },
  processingCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  processingTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
  },
  processingSubtitle: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
});
