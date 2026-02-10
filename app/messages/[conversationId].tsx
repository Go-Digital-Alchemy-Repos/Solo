import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet, Platform,
  TextInput, KeyboardAvoidingView, Image, Pressable, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily, Shadows } from '@/constants/theme';
import Text from '@/components/ui/Text';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDm, DmMessage } from '@/lib/dm-context';
import { useAuth } from '@/lib/auth-context';

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  const dayMs = 86400000;

  if (diff < dayMs) return 'Today';
  if (diff < dayMs * 2) return 'Yesterday';
  if (diff < dayMs * 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function shouldShowDayHeader(messages: DmMessage[], index: number): boolean {
  if (index === messages.length - 1) return true;
  const current = new Date(messages[index].createdAt);
  const next = new Date(messages[index + 1].createdAt);
  return current.toDateString() !== next.toDateString();
}

function MessageBubble({ message, isOwn, showAvatar, onLongPress }: {
  message: DmMessage;
  isOwn: boolean;
  showAvatar: boolean;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const isOptimistic = message._optimistic;
  const isFailed = message._failed;

  return (
    <View style={[
      styles.bubbleRow,
      isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther,
    ]}>
      {!isOwn && showAvatar && (
        message.sender?.avatarUrl ? (
          <Image
            source={{ uri: message.sender.avatarUrl }}
            style={styles.bubbleAvatar}
          />
        ) : (
          <View style={[styles.bubbleAvatar, styles.bubbleAvatarPlaceholder]}>
            <Text variant="caption" color={Colors.accent}>
              {(message.sender?.username || '?')[0].toUpperCase()}
            </Text>
          </View>
        )
      )}
      {!isOwn && !showAvatar && <View style={{ width: 28, marginRight: 8 }} />}

      <Animated.View style={animStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onLongPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            onLongPress();
          }}
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            isOptimistic && styles.bubbleOptimistic,
            isFailed && styles.bubbleFailed,
          ]}
        >
          {message.type === 'text' && (
            <Text
              variant="body"
              color={isOwn ? '#000' : Colors.text}
              style={{ lineHeight: 20 }}
            >
              {message.text}
            </Text>
          )}
          {message.type === 'image' && message.mediaUrl && (
            <Image
              source={{ uri: message.mediaUrl }}
              style={{ width: 200, height: 200, borderRadius: Radius.md }}
              resizeMode="cover"
            />
          )}
          <View style={styles.bubbleMeta}>
            <Text variant="caption" color={isOwn ? 'rgba(0,0,0,0.5)' : Colors.textMuted} style={{ fontSize: 10 }}>
              {formatMessageTime(message.createdAt)}
            </Text>
            {isOptimistic && (
              <Ionicons name="time-outline" size={10} color={isOwn ? 'rgba(0,0,0,0.4)' : Colors.textMuted} style={{ marginLeft: 4 }} />
            )}
            {isFailed && (
              <Ionicons name="alert-circle" size={12} color={Colors.danger} style={{ marginLeft: 4 }} />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowOther, { paddingLeft: 36 + Spacing.xl }]}>
      <View style={[styles.bubble, styles.bubbleOther, { paddingVertical: 10, paddingHorizontal: 16 }]}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.typingDot} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    messages, loadingMessages, loadMoreMessages, hasMoreMessages,
    setActiveConversation, sendMessage, markAsRead, deleteMessage,
    typing, sendTyping, conversations, presence,
  } = useDm();

  const [text, setText] = useState('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const conversation = useMemo(() =>
    conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const otherUser = conversation?.otherUser;
  const otherPresence = otherUser ? presence[otherUser.userId] : null;

  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
    }
    return () => {
      setActiveConversation(null);
    };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0 && user) {
      const lastOtherMsg = messages.find((m) => m.senderId !== user.id);
      if (lastOtherMsg) {
        markAsRead(lastOtherMsg.id);
      }
    }
  }, [messages, user]);

  const isTyping = useMemo(() => {
    if (!conversationId || !user) return false;
    const convTyping = typing[conversationId];
    if (!convTyping) return false;
    return Object.entries(convTyping).some(([uid, t]) => uid !== user.id && t);
  }, [typing, conversationId, user]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const nonce = Crypto.randomUUID();
    setText('');
    sendTyping(false);

    await sendMessage(trimmed, nonce);
  }, [text, sendMessage, sendTyping]);

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 3000);
  }, [sendTyping]);

  const handleLongPress = useCallback((msg: DmMessage) => {
    if (Platform.OS === 'web') return;
    const isOwn = msg.senderId === user?.id;

    const options = ['Copy'];
    if (isOwn && !msg._optimistic) options.push('Delete');
    options.push('Cancel');

    Alert.alert('Message', undefined, [
      { text: 'Copy', onPress: () => {} },
      ...(isOwn && !msg._optimistic
        ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => deleteMessage(msg.id) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [user, deleteMessage]);

  const renderItem = useCallback(({ item, index }: { item: DmMessage; index: number }) => {
    const isOwn = item.senderId === user?.id;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showAvatar = !isOwn && (!prevMsg || prevMsg.senderId !== item.senderId);

    return (
      <View>
        {shouldShowDayHeader(messages, index) && (
          <View style={styles.dayHeaderWrap}>
            <Text variant="caption" color={Colors.textMuted} style={styles.dayHeaderText}>
              {formatDayHeader(item.createdAt)}
            </Text>
          </View>
        )}
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showAvatar={showAvatar}
          onLongPress={() => handleLongPress(item)}
        />
      </View>
    );
  }, [user, messages, handleLongPress]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topInset + Spacing.xs }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {otherUser?.avatarUrl ? (
            <Image source={{ uri: otherUser.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
              <Text variant="body" color={Colors.accent}>
                {(otherUser?.username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ marginLeft: Spacing.sm }}>
            <Text variant="body" style={{ fontFamily: FontFamily.semibold }}>
              {otherUser?.username || 'Chat'}
            </Text>
            {otherPresence?.status === 'online' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.onlineDot} />
                <Text variant="caption" color={Colors.success} style={{ marginLeft: 4 }}>Online</Text>
              </View>
            ) : otherPresence?.lastSeenAt ? (
              <Text variant="caption" color={Colors.textMuted}>
                Last seen {formatMessageTime(otherPresence.lastSeenAt)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {loadingMessages && messages.length === 0 ? (
        <View style={styles.loadingWrap}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[styles.bubbleRow, i % 2 === 0 ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
              <Skeleton width={i % 2 === 0 ? 180 : 220} height={40} radius={Radius.lg} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id || item.clientNonce || Math.random().toString()}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ paddingHorizontal: Spacing.sm, paddingTop: Spacing.md }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={() => {
            if (hasMoreMessages && !loadingMessages) {
              loadMoreMessages();
            }
          }}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.composerWrap, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <View style={styles.composerInner}>
          <TextInput
            style={styles.composerInput}
            placeholder="Message..."
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={[
              styles.sendBtn,
              text.trim() ? styles.sendBtnActive : styles.sendBtnInactive,
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={text.trim() ? '#000' : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: Colors.bg,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.xs,
    flex: 1,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
  },
  headerAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  loadingWrap: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 1,
    paddingHorizontal: Spacing.sm,
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: Colors.surfaceLight,
    alignSelf: 'flex-end',
  },
  bubbleAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bubbleOwn: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 6,
  },
  bubbleOptimistic: {
    opacity: 0.7,
  },
  bubbleFailed: {
    opacity: 0.5,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  dayHeaderWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  dayHeaderText: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  composerWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: Colors.bg,
  },
  composerInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    minHeight: 44,
  },
  composerInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
    marginBottom: 2,
  },
  sendBtnActive: {
    backgroundColor: Colors.accent,
  },
  sendBtnInactive: {
    backgroundColor: 'transparent',
  },
});
