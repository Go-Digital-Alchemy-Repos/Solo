import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing, withSpring } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useData } from '@/lib/data-context';

const MAX_DURATION_MS = 300000;
const MIN_DURATION_MS = 15000;

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

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, addPost } = useData();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
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
    if (isRecording) {
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
  }, [isRecording]);

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
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedUri(null);

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
      setIsRecording(false);
      recordingRef.current = null;
    } catch (e) {
      console.error('Failed to stop recording:', e);
      setIsRecording(false);
    }
  }, []);

  const discardRecording = useCallback(() => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setTitle('');
  }, []);

  const saveRecording = useCallback(() => {
    if (!recordedUri || !title.trim()) {
      Alert.alert('Missing Title', 'Please add a title for your recording.');
      return;
    }
    if (recordingDuration < MIN_DURATION_MS) {
      Alert.alert('Too Short', 'Recording must be at least 15 seconds.');
      return;
    }
    addPost({
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUri: currentUser.avatarUri,
      title: title.trim(),
      audioUri: recordedUri,
      durationMs: recordingDuration,
      teaserDurationMs: Math.min(60000, recordingDuration),
      isRSS: false,
    });
    setRecordedUri(null);
    setRecordingDuration(0);
    setTitle('');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Alert.alert('Posted!', 'Your sound has been shared.');
  }, [recordedUri, title, recordingDuration, addPost, currentUser]);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (permissionGranted === false) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
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

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Record</Text>
      </View>

      {recordedUri && !isRecording ? (
        <View style={styles.reviewContainer}>
          <View style={styles.reviewCard}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.accent} />
            <Text style={styles.reviewDuration}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.reviewLabel}>recorded</Text>
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
            <Pressable onPress={saveRecording} style={styles.postBtn}>
              <Feather name="upload" size={20} color={Colors.bg} />
              <Text style={styles.postText}>Post</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.recordContainer}>
          <View style={styles.waveformLive}>
            {bars.map(i => (
              <LiveBar key={i} index={i} isRecording={isRecording} />
            ))}
          </View>

          <Text style={styles.timer}>{formatDuration(recordingDuration)}</Text>
          <Text style={styles.timerLabel}>
            {isRecording ? 'Recording...' : 'Tap to start'}
          </Text>

          <View style={styles.recBtnContainer}>
            <Animated.View style={[styles.recPulse, pulseStyle]} />
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              style={[styles.recBtn, isRecording && styles.recBtnActive]}
            >
              {isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <Ionicons name="mic" size={32} color={Colors.bg} />
              )}
            </Pressable>
          </View>

          <Text style={styles.durationHint}>
            {isRecording
              ? `Max ${formatDuration(MAX_DURATION_MS)}`
              : `Min 15s / Max 5min`
            }
          </Text>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: Colors.accent,
    fontSize: 24,
    fontFamily: 'DMSans_700Bold',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  waveformLive: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 2,
    marginBottom: 20,
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
  recBtnContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
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
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: Colors.bg,
  },
  durationHint: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 20,
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
