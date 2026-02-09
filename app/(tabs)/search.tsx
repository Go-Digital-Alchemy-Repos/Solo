import React, { useState, useMemo } from 'react';
import { StyleSheet, View, TextInput, FlatList, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import { Text, EmptyState } from '@/components/ui';
import Avatar from '@/components/Avatar';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import { useData, type UserProfile, type AudioPost } from '@/lib/data-context';

type SearchResult = { type: 'user'; data: UserProfile } | { type: 'post'; data: AudioPost };

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { searchPosts, searchUsers, allUsers, posts, following, toggleFollow } = useData();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'people' | 'sounds'>('all');
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const users = searchUsers(query);
    const audioPosts = searchPosts(query);

    if (activeTab === 'people') return users.map(u => ({ type: 'user' as const, data: u }));
    if (activeTab === 'sounds') return audioPosts.map(p => ({ type: 'post' as const, data: p }));

    const combined: SearchResult[] = [
      ...users.map(u => ({ type: 'user' as const, data: u })),
      ...audioPosts.map(p => ({ type: 'post' as const, data: p })),
    ];
    return combined;
  }, [query, activeTab, searchPosts, searchUsers]);

  const trendingUsers = allUsers.slice(0, 5);

  const renderItem = ({ item }: { item: SearchResult }) => {
    if (item.type === 'user') {
      const user = item.data as UserProfile;
      const isFollowing = following.has(user.id);
      return (
        <View style={styles.userRow}>
          <Avatar uri={user.avatarUri} size={44} />
          <View style={styles.userInfo}>
            <Text variant="body" bold>{user.displayName}</Text>
            <Text variant="caption" color={Colors.textDim}>@{user.username}</Text>
          </View>
          <Pressable
            onPress={() => toggleFollow(user.id)}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          >
            <Text variant="label" color={isFollowing ? Colors.bg : Colors.accent} style={{ fontSize: FontSize.sm }}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>
      );
    }
    return <SoundCard post={item.data as AudioPost} />;
  };

  return (
    <View style={styles.container}>
      <SoloHeader />
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search sounds & people"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        {query.length > 0 && (
          <View style={styles.tabs}>
            {(['all', 'people', 'sounds'] as const).map(tab => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
              >
                <Text variant="label" color={activeTab === tab ? Colors.bg : Colors.textDim}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>


      {query.length === 0 ? (
        <View style={styles.discoverSection}>
          <Text variant="h3" color={Colors.accent} style={styles.discoverTitle}>Trending Creators</Text>
          {trendingUsers.map(user => {
            const isFollowing = following.has(user.id);
            return (
              <View key={user.id} style={styles.userRow}>
                <Avatar uri={user.avatarUri} size={48} />
                <View style={styles.userInfo}>
                  <Text variant="body" bold>{user.displayName}</Text>
                  <Text variant="caption" color={Colors.textDim}>@{user.username}</Text>
                  <Text variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
                    {user.followerCount.toLocaleString()} followers
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggleFollow(user.id)}
                  style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                >
                  <Text variant="label" color={isFollowing ? Colors.bg : Colors.accent} style={{ fontSize: FontSize.sm }}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.type}-${item.type === 'user' ? (item.data as UserProfile).id : (item.data as AudioPost).id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 84 : 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="search-outline" size={28} color={Colors.accent} />}
              title="No results found"
              message="Try a different search term"
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
  searchSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.sm,
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  discoverSection: {
    padding: Spacing.lg,
  },
  discoverTitle: {
    marginBottom: Spacing.lg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  followBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  followBtnActive: {
    backgroundColor: Colors.accent,
  },
});
