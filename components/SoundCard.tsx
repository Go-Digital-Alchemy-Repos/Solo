import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable, TextInput, FlatList, Platform, ActivityIndicator, PanResponder, LayoutChangeEvent } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily, HitSlop } from '@/constants/theme';
import { Text } from '@/components/ui';
import Avatar from './Avatar';
import WaveformBars from './WaveformBars';
import LyricView from './LyricView';
import { usePlayback } from '@/lib/playback-provider';
import { useData, type AudioPost, type Transcript } from '@/lib/data-context';
import { authFetch } from '@/lib/auth-fetch';

interface SoundCardProps {
  post: AudioPost;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SoundCard({ post }: SoundCardProps) {
  const { state, play, pause, resume, seekTo, preload } = usePlayback();
  const { toggleLike, addComment, following, toggleFollow } = useData();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [fullMode, setFullMode] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(post.transcript);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const scrubberWidth = useRef(0);
  const scrubRef = useRef({ scrubPosition: 0, durationMillis: 0, isLoaded: false });

  useEffect(() => {
    if (post.audioUrl) {
      preload(post.audioUrl);
    }
  }, [post.audioUrl, preload]);

  const isThisPlaying = state.currentPostId === post.id && state.isPlaying;
  const isThisLoaded = state.currentPostId === post.id;
  const isThisLoading = state.currentPostId === post.id && state.isLoading;
  const progress = isThisLoaded && state.durationMillis > 0
    ? state.positionMillis / state.durationMillis
    : 0;

  scrubRef.current.scrubPosition = scrubPosition;
  scrubRef.current.durationMillis = state.durationMillis;
  scrubRef.current.isLoaded = isThisLoaded;

  const displayProgress = isScrubbing ? scrubPosition : progress;
  const displayPositionMs = isScrubbing
    ? scrubPosition * (isThisLoaded ? state.durationMillis : post.durationMs)
    : (isThisLoaded ? state.positionMillis : 0);

  const scrubberPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (!scrubRef.current.isLoaded) return;
        setIsScrubbing(true);
        const x = evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / Math.max(scrubberWidth.current, 1)));
        setScrubPosition(ratio);
      },
      onPanResponderMove: (evt) => {
        if (!scrubRef.current.isLoaded) return;
        const x = evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / Math.max(scrubberWidth.current, 1)));
        setScrubPosition(ratio);
      },
      onPanResponderRelease: () => {
        if (!scrubRef.current.isLoaded) return;
        const seekMs = scrubRef.current.scrubPosition * scrubRef.current.durationMillis;
        seekTo(seekMs);
        setIsScrubbing(false);
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
      },
    })
  ).current;

  const onScrubberLayout = useCallback((e: LayoutChangeEvent) => {
    scrubberWidth.current = e.nativeEvent.layout.width;
  }, []);

  const likeScale = useSharedValue(1);
  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const handlePlayPause = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isThisPlaying) {
      await pause();
    } else if (isThisLoaded && !state.isPlaying) {
      await resume();
    } else {
      await play(post.id, post.audioUri);
    }
  }, [isThisPlaying, isThisLoaded, state.isPlaying, pause, resume, play, post]);

  const handleLike = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    likeScale.value = withSequence(
      withSpring(1.4, { damping: 4 }),
      withSpring(1, { damping: 8 }),
    );
    toggleLike(post.id);
  }, [toggleLike, post.id]);

  const handleComment = useCallback(() => {
    if (commentText.trim()) {
      addComment(post.id, commentText.trim());
      setCommentText('');
    }
  }, [commentText, addComment, post.id]);

  const handleListenFull = useCallback(async () => {
    setFullMode(true);
    await play(post.id, post.audioUri, 0);
  }, [play, post]);

  const handleToggleLyrics = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (showLyrics) {
      setShowLyrics(false);
      return;
    }
    if (transcript && transcript.words.length > 0) {
      setShowLyrics(true);
      return;
    }
    setIsTranscribing(true);
    try {
      const res = await authFetch(`/api/solos/${post.id}/transcribe`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.transcript && data.transcript.words?.length > 0) {
          setTranscript(data.transcript);
          setShowLyrics(true);
        }
      }
    } catch (e) {
      console.error('Transcription failed:', e);
    } finally {
      setIsTranscribing(false);
    }
  }, [showLyrics, transcript, post.id]);

  const isFollowing = following.has(post.userId);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar uri={post.avatarUri} size={40} />
        <View style={styles.headerInfo}>
          <Text variant="bodySmall" bold>{post.displayName}</Text>
          <Text variant="caption" color={Colors.textDim}>@{post.username}</Text>
        </View>
        <Text variant="caption" color={Colors.textMuted} style={styles.timeAgo}>{formatTimeAgo(post.createdAt)}</Text>
        {post.userId !== 'me' && (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleFollow(post.userId);
            }}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          >
            <Text variant="label" color={isFollowing ? Colors.bg : Colors.accent} style={{ fontSize: FontSize.sm }}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}
      </View>

      <Text variant="h3" style={styles.title}>{post.title}</Text>
      {post.isRSS && (
        <View style={styles.rssBadge}>
          <Ionicons name="radio" size={12} color={Colors.accent} />
          <Text variant="overline" color={Colors.accent}>RSS Feed</Text>
        </View>
      )}

      <View style={styles.waveformContainer}>
        {showLyrics && transcript ? (
          <LyricView
            words={transcript.words}
            positionMs={displayPositionMs}
            isActive={isThisLoaded}
            height={80}
          />
        ) : (
          <WaveformBars
            data={post.waveformData}
            isPlaying={isThisPlaying}
            progress={displayProgress}
            height={64}
            barWidth={3}
            loading={isThisLoading}
          />
        )}
      </View>

      <View
        style={styles.scrubberTrack}
        onLayout={onScrubberLayout}
        {...scrubberPanResponder.panHandlers}
      >
        <View style={styles.scrubberBg} />
        <View style={[styles.scrubberFill, { width: `${displayProgress * 100}%` as any }]} />
        <View style={[styles.scrubberThumb, { left: `${displayProgress * 100}%` as any }]} />
      </View>

      <View style={styles.controls}>
        <Pressable onPress={handlePlayPause} style={styles.playBtn}>
          <Ionicons
            name={isThisPlaying ? 'pause' : 'play'}
            size={22}
            color={Colors.bg}
          />
        </Pressable>
        <View style={styles.timeInfo}>
          <Text variant="caption" color={Colors.textDim} style={styles.timeText}>
            {formatTime(displayPositionMs)}
          </Text>
          <Text variant="caption" color={Colors.textMuted} style={{ marginHorizontal: 2 }}>/</Text>
          <Text variant="caption" color={Colors.textDim} style={styles.timeText}>
            {formatTime(post.durationMs)}
          </Text>
        </View>
        <Pressable onPress={handleToggleLyrics} style={styles.transcriptBtn} disabled={isTranscribing}>
          {isTranscribing ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <MaterialCommunityIcons
              name={showLyrics ? 'waveform' : 'text-box-outline'}
              size={18}
              color={showLyrics ? Colors.accent : Colors.textDim}
            />
          )}
        </Pressable>
        {post.isRSS && !fullMode && (
          <Pressable onPress={handleListenFull} style={styles.fullBtn}>
            <Feather name="headphones" size={14} color={Colors.accent} />
            <Text variant="label" color={Colors.accent} style={{ fontSize: FontSize.sm }}>Full Episode</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.socialBar}>
        <Pressable onPress={handleLike} style={styles.socialBtn}>
          <Animated.View style={likeAnimStyle}>
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={22}
              color={post.liked ? '#FF4444' : Colors.textDim}
            />
          </Animated.View>
          <Text variant="body" color={post.liked ? '#FF4444' : Colors.textDim}>
            {post.likes}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowComments(!showComments)}
          style={styles.socialBtn}
        >
          <Ionicons
            name={showComments ? 'chatbubble' : 'chatbubble-outline'}
            size={20}
            color={showComments ? Colors.accent : Colors.textDim}
          />
          <Text variant="body" color={showComments ? Colors.accent : Colors.textDim}>
            {post.comments.length}
          </Text>
        </Pressable>

        <Pressable style={styles.socialBtn}>
          <Feather name="share" size={20} color={Colors.textDim} />
        </Pressable>
      </View>

      {showComments && (
        <View style={styles.commentsSection}>
          {post.comments.map(comment => (
            <View key={comment.id} style={styles.commentRow}>
              <Avatar uri={comment.avatarUri} size={28} borderWidth={1} showBorder={false} />
              <View style={styles.commentContent}>
                <Text variant="label" color={Colors.accent} style={{ fontSize: FontSize.sm, marginBottom: 2 }}>@{comment.username}</Text>
                <Text variant="body">{comment.text}</Text>
              </View>
            </View>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor={Colors.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              returnKeyType="send"
              onSubmitEditing={handleComment}
            />
            <Pressable onPress={handleComment} disabled={!commentText.trim()}>
              <Ionicons
                name="send"
                size={20}
                color={commentText.trim() ? Colors.accent : Colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  timeAgo: {
    marginRight: Spacing.sm,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  followBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  rssBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  waveformContainer: {
    marginBottom: Spacing.sm,
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  scrubberTrack: {
    height: 24,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  scrubberBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrubberFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.accent,
  },
  scrubberThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.accent,
    marginLeft: -7,
    top: 5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontVariant: ['tabular-nums'],
  },
  transcriptBtn: {
    marginLeft: 'auto' as const,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  socialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: Spacing.xl,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentsSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
  },
});
