import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, TextInput, FlatList, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
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
            <Text style={styles.userDisplayName}>{user.displayName}</Text>
            <Text style={styles.userUsername}>@{user.username}</Text>
          </View>
          <Pressable
            onPress={() => toggleFollow(user.id)}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          >
            <Text style={[styles.followText, isFollowing && styles.followTextActive]}>
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
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>


      {query.length === 0 ? (
        <View style={styles.discoverSection}>
          <Text style={styles.discoverTitle}>Trending Creators</Text>
          {trendingUsers.map(user => {
            const isFollowing = following.has(user.id);
            return (
              <View key={user.id} style={styles.userRow}>
                <Avatar uri={user.avatarUri} size={48} />
                <View style={styles.userInfo}>
                  <Text style={styles.userDisplayName}>{user.displayName}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                  <Text style={styles.userFollowers}>{user.followerCount.toLocaleString()} followers</Text>
                </View>
                <Pressable
                  onPress={() => toggleFollow(user.id)}
                  style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                >
                  <Text style={[styles.followText, isFollowing && styles.followTextActive]}>
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
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No results found</Text>
            </View>
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  tabTextActive: {
    color: Colors.bg,
  },
  discoverSection: {
    padding: 16,
  },
  discoverTitle: {
    color: Colors.accent,
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
  userUsername: {
    color: Colors.textDim,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  userFollowers: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  followBtnActive: {
    backgroundColor: Colors.accent,
  },
  followText: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  followTextActive: {
    color: Colors.bg,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
});
