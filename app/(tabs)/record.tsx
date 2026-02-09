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

const STEP_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  upload: { label: 'Uploading audio', icon: 'cloud-upload' },
  trim: { label: 'Trimming audio', icon: 'cut' },
  mix: { label: 'Mixing vibes', icon: 'musical-notes' },
  transcribe: { label: 'Transcribing words', icon: 'text' },
  done: { label: 'Finishing up', icon: 'checkmark-circle' },
};

const STEP_ORDER = ['upload', 'trim', 'mix', 'transcribe', 'done'];

function ProcessingScreen({ soloId, onComplete, onFailed }: {
  soloId: string;
  onComplete: () => void;
  onFailed: (error: string) => void;
}) {
  const { pollSoloStatus } = useData();
  const [currentStep, setCurrentStep] = useState('upload');
  const [status, setStatus] = useState<'queued' | 'processing' | 'ready' | 'failed'>('queued');

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

  useEffect(() => {
    if (!soloId) return;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const result = await pollSoloStatus(soloId);
          if (cancelled) return;
          setStatus(result.status);
          setCurrentStep(result.processingStep);

          if (result.status === 'ready') {
            onComplete();
            return;
          }
          if (result.status === 'failed') {
            onFailed(result.processingError || 'Processing failed');
            return;
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [soloId]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const stepInfo = STEP_LABELS[currentStep] || STEP_LABELS.upload;

  return (
    <View style={styles.processingContainer}>
      <View style={styles.processingCircleWrap}>
        <Animated.View style={[styles.processingPulse, pulseStyle]} />
        <View style={styles.processingCircle}>
          <Ionicons name={stepInfo.icon} size={36} color={Colors.bg} />
        </View>
      </View>
      <Text style={styles.processingTitle}>Processing your Solo</Text>
      <Text style={styles.processingSubtitle}>{stepInfo.label}...</Text>
      <View style={styles.stepsContainer}>
        {STEP_ORDER.map((step, i) => {
          const info = STEP_LABELS[step];
          const isActive = step === currentStep;
          const isCompleted = i < currentStepIndex;
          return (
            <View key={step} style={styles.stepRow}>
              <View style={[
                styles.stepDot,
                isCompleted && styles.stepDotCompleted,
                isActive && styles.stepDotActive,
              ]}>
                {isCompleted && <Ionicons name="checkmark" size={10} color={Colors.bg} />}
              </View>
              <Text style={[
                styles.stepLabel,
                isCompleted && styles.stepLabelCompleted,
                isActive && styles.stepLabelActive,
              ]}>{info.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type FailedPhase = { phase: 'failed'; soloId: string; error: string };

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uploadAndPost, retrySolo, refreshFeed } = useData();
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [segmentCount, setSegmentCount] = useState(1);
  const [segmentMarkers, setSegmentMarkers] = useState<number[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [processingSoloId, setProcessingSoloId] = useState<string | null>(null);
  const [failedInfo, setFailedInfo] = useState<{ soloId: string; error: string } | null>(null);
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
    setProcessingSoloId(null);
    setFailedInfo(null);
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
    setFailedInfo(null);

    try {
      const soloId = await uploadAndPost({
        audioUri: recordedUri,
        title,
        durationMs: effectiveDuration,
        trimStartMs,
        trimEndMs,
        vibeId: vibeId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      setProcessingSoloId(soloId);
    } catch (e: any) {
      console.error('Failed to upload:', e?.message || e, e?.stack);
      setIsPosting(false);
      setPhase('editing');
      Alert.alert('Upload Failed', 'Could not upload your recording. Please try again.');
    }
  }, [recordedUri, uploadAndPost]);

  const handleProcessingComplete = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    refreshFeed();
    resetAll();
    router.replace('/(tabs)/');
  }, [resetAll, refreshFeed]);

  const handleProcessingFailed = useCallback((error: string) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setFailedInfo({ soloId: processingSoloId || '', error });
  }, [processingSoloId]);

  const handleRetry = useCallback(async () => {
    if (!failedInfo?.soloId) return;
    try {
      setFailedInfo(null);
      await retrySolo(failedInfo.soloId);
      setProcessingSoloId(failedInfo.soloId);
    } catch (e: any) {
      Alert.alert('Retry Failed', e?.message || 'Could not retry processing.');
      setFailedInfo({ soloId: failedInfo.soloId, error: e?.message || 'Retry failed' });
    }
  }, [failedInfo, retrySolo]);

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

  if (phase === 'processing' && failedInfo) {
    return (
      <View style={styles.container}>
        <SoloHeader />
        <View style={styles.processingContainer}>
          <View style={styles.processingCircleWrap}>
            <View style={[styles.processingCircle, { backgroundColor: Colors.danger }]}>
              <Ionicons name="alert-circle" size={36} color="#fff" />
            </View>
          </View>
          <Text style={styles.processingTitle}>Processing Failed</Text>
          <Text style={styles.processingSubtitle}>{failedInfo.error}</Text>
          <View style={styles.failedActions}>
            <Pressable onPress={handleRetry} style={styles.retryBtn}>
              <Ionicons name="refresh" size={20} color={Colors.bg} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
            <Pressable onPress={resetAll} style={styles.discardBtn}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (phase === 'processing' && processingSoloId) {
    return (
      <View style={styles.container}>
        <SoloHeader />
        <ProcessingScreen
          soloId={processingSoloId}
          onComplete={handleProcessingComplete}
          onFailed={handleProcessingFailed}
        />
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
  stepsContainer: {
    marginTop: 24,
    gap: 12,
    alignSelf: 'stretch',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  stepDotCompleted: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  stepDotActive: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  stepLabel: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
  },
  stepLabelCompleted: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  stepLabelActive: {
    color: Colors.accent,
  },
  failedActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  discardBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  discardBtnText: {
    color: Colors.textDim,
    fontSize: 15,
    fontFamily: 'DMSans_500Medium',
  },
});
