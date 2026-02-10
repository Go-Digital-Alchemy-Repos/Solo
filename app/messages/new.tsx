import React, { useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet, Platform,
  TextInput, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import Text from '@/components/ui/Text';
import { useDm, DmUser } from '@/lib/dm-context';

export default function NewMessageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { searchUsers, startConversation } = useDm();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DmUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await searchUsers(text);
      setResults(users);
    } catch {
    } finally {
      setSearching(false);
    }
  }, [searchUsers]);

  const handleSelectUser = useCallback(async (user: DmUser) => {
    if (starting) return;
    setStarting(true);
    try {
      const convId = await startConversation(user.userId);
      router.replace(`/messages/${convId}` as any);
    } catch {
      setStarting(false);
    }
  }, [startConversation, router, starting]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text variant="h3" style={{ marginLeft: Spacing.md, flex: 1 }}>New Message</Text>
      </View>

      <View style={styles.searchWrap}>
        <Text variant="body" color={Colors.textDim} style={{ marginRight: Spacing.sm }}>To:</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={handleSearch}
          autoFocus
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={Colors.accent} />}
      </View>

      {starting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userRow}
            onPress={() => handleSelectUser(item)}
            activeOpacity={0.7}
            disabled={starting}
          >
            {item.avatarUrl ? (
              <Image
                source={{ uri: item.avatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text variant="h3" color={Colors.accent}>
                  {(item.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text variant="body" style={{ fontFamily: FontFamily.medium }}>
                {item.username}
              </Text>
              {item.bio ? (
                <Text variant="bodySmall" color={Colors.textDim} numberOfLines={1}>
                  {item.bio}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          query.length >= 2 && !searching ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={Colors.textDim}>No users found</Text>
            </View>
          ) : query.length < 2 && query.length > 0 ? (
            <View style={styles.emptyState}>
              <Text variant="bodySmall" color={Colors.textMuted}>
                Type at least 2 characters to search
              </Text>
            </View>
          ) : null
        }
      />
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    paddingVertical: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl * 2,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
