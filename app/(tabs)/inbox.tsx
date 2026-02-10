import React, { useState, useCallback, useMemo } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet, Platform,
  TextInput, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import Text from '@/components/ui/Text';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDm, DmConversation } from '@/lib/dm-context';

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AvatarCircle({ uri, name, size = 52 }: { uri: string | null; name: string; size?: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.surfaceLight }}
      />
    );
  }
  const initial = (name || '?')[0].toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text variant="h3" color={Colors.accent}>{initial}</Text>
    </View>
  );
}

function ConversationRow({ conversation, onPress }: { conversation: DmConversation; onPress: () => void }) {
  const other = conversation.otherUser;
  const name = other?.username || 'Unknown';
  const avatar = other?.avatarUrl || null;
  const hasUnread = conversation.unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.convRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ position: 'relative' }}>
        <AvatarCircle uri={avatar} name={name} />
      </View>
      <View style={styles.convInfo}>
        <View style={styles.convTopRow}>
          <Text
            variant="body"
            style={{ fontFamily: hasUnread ? FontFamily.bold : FontFamily.medium, flex: 1 }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text variant="caption" color={hasUnread ? Colors.accent : Colors.textMuted}>
            {formatTimeAgo(conversation.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text
            variant="bodySmall"
            color={hasUnread ? Colors.text : Colors.textDim}
            numberOfLines={1}
            style={{ flex: 1, fontFamily: hasUnread ? FontFamily.semibold : FontFamily.regular }}
          >
            {conversation.lastMessagePreview || 'Start a conversation'}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text variant="caption" color="#000" style={{ fontFamily: FontFamily.bold, fontSize: 10 }}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversations, loadingConversations, refreshConversations } = useDm();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const filteredConvos = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name = c.otherUser?.username || '';
      return name.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshConversations();
    setRefreshing(false);
  }, [refreshConversations]);

  const openChat = useCallback((convId: string) => {
    router.push(`/messages/${convId}` as any);
  }, [router]);

  const openNewMessage = useCallback(() => {
    router.push('/messages/new' as any);
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + Spacing.sm }]}>
        <Text variant="h2">Messages</Text>
        <TouchableOpacity onPress={openNewMessage} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="create-outline" size={24} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loadingConversations && conversations.length === 0 ? (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.convRow}>
              <Skeleton width={52} height={52} radius={26} />
              <View style={{ flex: 1, marginLeft: Spacing.md, gap: 8 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="80%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : filteredConvos.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
          <Text variant="body" color={Colors.textDim} style={{ marginTop: Spacing.md, textAlign: 'center' }}>
            {search ? 'No conversations found' : 'No messages yet'}
          </Text>
          {!search && (
            <TouchableOpacity style={styles.startBtn} onPress={openNewMessage}>
              <Text variant="body" color="#000" style={{ fontFamily: FontFamily.semibold }}>
                Start a conversation
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredConvos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationRow conversation={item} onPress={() => openChat(item.id)} />
          )}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 84 : insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    paddingVertical: 0,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  convInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  convTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: Spacing.sm,
  },
  skeletonWrap: {
    paddingTop: Spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  startBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    marginTop: Spacing.xl,
  },
});
