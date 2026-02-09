import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Platform, ActivityIndicator } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import Avatar from './Avatar';
import WaveformBars from './WaveformBars';
import LyricView from './LyricView';
import { usePlayback } from '@/lib/playback-provider';
import { useData, type AudioPost, type Transcript } from '@/lib/data-context';
import { getApiUrl } from '@/lib/query-client';

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
  const { state, play, pause, resume } = usePlayback();
  const { toggleLike, addComment, following, toggleFollow } = useData();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [fullMode, setFullMode] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(post.transcript);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const isThisPlaying = state.currentPostId === post.id && state.isPlaying;
  const isThisLoaded = state.currentPostId === post.id;
  const progress = isThisLoaded && state.durationMillis > 0
    ? state.positionMillis / state.durationMillis
    : 0;

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
      const baseUrl = getApiUrl();
      const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
      const headers: Record<string, string> = {};
      const sessionCookie = await AsyncStorage.getItem('solo_auth_session');
      if (sessionCookie) {
        headers['X-Session-Token'] = sessionCookie;
        if (Platform.OS !== 'web') {
          headers['Cookie'] = sessionCookie;
        }
      }
      const res = await fetchFn(new URL(`/api/solos/${post.id}/transcribe`, baseUrl).toString(), {
        method: 'POST',
        headers,
        credentials: 'include',
      } as any);
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
          <Text style={styles.displayName}>{post.displayName}</Text>
          <Text style={styles.username}>@{post.username}</Text>
        </View>
        <Text style={styles.timeAgo}>{formatTimeAgo(post.createdAt)}</Text>
        {post.userId !== 'me' && (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleFollow(post.userId);
            }}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          >
            <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.title}>{post.title}</Text>
      {post.isRSS && (
        <View style={styles.rssBadge}>
          <Ionicons name="radio" size={12} color={Colors.accent} />
          <Text style={styles.rssBadgeText}>RSS Feed</Text>
        </View>
      )}

      <View style={styles.waveformContainer}>
        {showLyrics && transcript ? (
          <LyricView
            words={transcript.words}
            positionMs={isThisLoaded ? state.positionMillis : 0}
            isActive={isThisLoaded}
            height={80}
          />
        ) : (
          <WaveformBars
            data={post.waveformData}
            isPlaying={isThisPlaying}
            progress={progress}
            height={64}
            barWidth={3}
          />
        )}
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
          <Text style={styles.timeText}>
            {isThisLoaded ? formatTime(state.positionMillis) : '0:00'}
          </Text>
          <Text style={styles.timeSeparator}>/</Text>
          <Text style={styles.timeText}>
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
            <Text style={styles.fullBtnText}>Full Episode</Text>
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
          <Text style={[styles.socialCount, post.liked && { color: '#FF4444' }]}>
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
          <Text style={[styles.socialCount, showComments && { color: Colors.accent }]}>
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
                <Text style={styles.commentUsername}>@{comment.username}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
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
    backgroundColor: 'rgba(17, 17, 17, 0.5)',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  displayName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  username: {
    color: '#888888',
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  timeAgo: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginRight: 8,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  followBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  followBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
  },
  followBtnTextActive: {
    color: Colors.bg,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  rssBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  rssBadgeText: {
    color: Colors.accent,
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  waveformContainer: {
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    color: Colors.textMuted,
    fontSize: 13,
    marginHorizontal: 2,
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
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  fullBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
  },
  socialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 20,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socialCount: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
  },
  commentsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 2,
  },
  commentText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
});
