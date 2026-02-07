import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, TextInput, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import SoloHeader from '@/components/SoloHeader';
import WaveformTrimmer from '@/components/WaveformTrimmer';
import Teleprompter from '@/components/Teleprompter';
import VibeSelector from '@/components/VibeSelector';
import { useData } from '@/lib/data-context';

const MAX_DURATION_MS = 300000;
const MIN_DURATION_MS = 15000;

type RecordPhase = 'idle' | 'recording' | 'paused' | 'editing' | 'review';

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

function SegmentDivider() {
  return (
    <View style={{
      width: 2,
      height: 40,
      backgroundColor: Colors.danger,
      borderRadius: 1,
      opacity: 0.7,
      marginHorizontal: 1,
    }} />
  );
}

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, uploadAndPost, isUploading } = useData();
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [trimData, setTrimData] = useState<{ startMs: number; endMs: number } | null>(null);
  const [title, setTitle] = useState('');
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(1);
  const [segmentMarkers, setSegmentMarkers] = useState<number[]>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

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

  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
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
      setTrimData(null);
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
    setRecordedUri(null);
    setRecordingDuration(0);
    setPhase('idle');
    setTrimData(null);
    setTitle('');
    setSegmentCount(1);
    setSegmentMarkers([]);
  }, []);

  const discardRecording = useCallback(() => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setPhase('idle');
    setTrimData(null);
    setTitle('');
    setSegmentCount(1);
    setSegmentMarkers([]);
  }, []);

  const handleTrimConfirm = useCallback((startMs: number, endMs: number) => {
    setTrimData({ startMs, endMs });
    setPhase('review');
  }, []);

  const handleTrimDiscard = useCallback(() => {
    discardRecording();
  }, [discardRecording]);

  const effectiveDurationMs = trimData ? (trimData.endMs - trimData.startMs) : recordingDuration;

  const saveRecording = useCallback(async () => {
    if (!recordedUri || !title.trim()) {
      Alert.alert('Missing Title', 'Please add a title for your recording.');
      return;
    }
    if (effectiveDurationMs < MIN_DURATION_MS) {
      Alert.alert('Too Short', 'Your selection must be at least 15 seconds.');
      return;
    }
    try {
      await uploadAndPost({
        audioUri: recordedUri,
        title: title.trim(),
        durationMs: effectiveDurationMs,
        trimStartMs: trimData?.startMs,
        trimEndMs: trimData?.endMs,
        vibeId: selectedVibe || undefined,
      });
      setRecordedUri(null);
      setRecordingDuration(0);
      setPhase('idle');
      setTrimData(null);
      setTitle('');
      setSelectedVibe(null);
      setSegmentCount(1);
      setSegmentMarkers([]);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert('Posted!', 'Your sound has been shared.');
    } catch (e) {
      console.error('Failed to upload:', e);
      Alert.alert('Upload Failed', 'Could not upload your recording. Please try again.');
    }
  }, [recordedUri, title, effectiveDurationMs, trimData, selectedVibe, uploadAndPost]);

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

  const bars = Array.from({ length: 50 }, (_, i) => i);
  const isActiveRecording = phase === 'recording' || phase === 'paused';

  return (
    <View style={styles.container}>
      <SoloHeader />

      {phase === 'editing' && recordedUri ? (
        <WaveformTrimmer
          audioUri={recordedUri}
          durationMs={recordingDuration}
          onConfirm={handleTrimConfirm}
          onDiscard={handleTrimDiscard}
          segmentMarkers={segmentMarkers}
        />
      ) : phase === 'review' && recordedUri ? (
        <View style={styles.reviewContainer}>
          <View style={styles.reviewCard}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.accent} />
            <Text style={styles.reviewDuration}>{formatDuration(effectiveDurationMs)}</Text>
            <Text style={styles.reviewLabel}>
              {trimData ? 'trimmed' : 'recorded'}
              {selectedVibe ? ` + ${selectedVibe.replace('-', ' ')}` : ''}
            </Text>
            {segmentCount > 1 && (
              <Text style={styles.segmentBadge}>{segmentCount} segments</Text>
            )}
          </View>
          <TextInput
            style={styles.titleInput}
            placeholder="Give your sound a title..."
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <View style={styles.reviewActions}>
            <Pressable onPress={discardRecording} style={styles.discardBtn}>
              <Ionicons name="trash-outline" size={22} color={Colors.danger} />
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
            <Pressable onPress={saveRecording} style={[styles.postBtn, isUploading && { opacity: 0.6 }]} disabled={isUploading}>
              <Feather name={isUploading ? "loader" : "upload"} size={20} color={Colors.bg} />
              <Text style={styles.postText}>{isUploading ? 'Uploading...' : 'Post'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.recordContainer}>
          <View style={styles.toolsRow}>
            <Teleprompter
              isRecording={phase === 'recording'}
              isPaused={phase === 'paused'}
            />
            <VibeSelector
              selectedVibe={selectedVibe}
              onSelect={setSelectedVibe}
              isRecording={isActiveRecording}
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
              {segmentMarkers.length > 0 && phase === 'paused' && (
                <SegmentDivider />
              )}
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
                <Pressable onPress={stopRecording} style={styles.secondaryBtn}>
                  <View style={styles.stopIcon} />
                </Pressable>
              )}
            </View>

            <Text style={styles.durationHint}>
              {phase === 'recording'
                ? `Max ${formatDuration(MAX_DURATION_MS)}`
                : phase === 'paused'
                  ? 'Tap mic to resume, square to finish'
                  : `Min 15s / Max 5min`
              }
            </Text>
          </View>
        </View>
      )}
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
  stopIcon: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: Colors.text,
  },
  durationHint: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 16,
  },
  reviewContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
    gap: 20,
    alignItems: 'center',
  },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    gap: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.15)',
  },
  reviewDuration: {
    color: Colors.text,
    fontSize: 36,
    fontFamily: 'DMSans_700Bold',
  },
  reviewLabel: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  segmentBadge: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  titleInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.1)',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    marginTop: 8,
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
    borderColor: Colors.danger,
  },
  discardText: {
    color: Colors.danger,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
  postBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  postText: {
    color: Colors.bg,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
});
