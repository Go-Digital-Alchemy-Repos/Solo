import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, TextInput, FlatList, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import { Text, EmptyState } from '@/components/ui';
import Avatar from '@/components/Avatar';
import SoloHeader from '@/components/SoloHeader';
import { apiRequest, getApiUrl } from '@/lib/query-client';

const RECENT_SEARCHES_KEY = 'solo_recent_searches';
const MAX_RECENT = 8;

interface SearchUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  similarity?: number;
}

interface SearchSolo {
  id: string;
  title: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  audioUrl: string;
  durationMs: number;
  tags: string[];
  timestamp: string;
  userId: string;
  rank: number | null;
}

type ActiveTab = 'people' | 'sounds';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('people');
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [soloResults, setSoloResults] = useState<SearchSolo[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<SearchUser[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    loadRecentSearches();
    fetchTrending();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  };

  const saveRecentSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try { await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch {}
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    try { await AsyncStorage.removeItem(RECENT_SEARCHES_KEY); } catch {}
  };

  const fetchTrending = async () => {
    try {
      const res = await apiRequest('GET', '/api/search/trending');
      const json = await res.json();
      if (json.ok) setTrendingUsers(json.data);
    } catch {}
  };

  const performSearch = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) {
      setUserResults([]);
      setSoloResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const [usersRes, solosRes] = await Promise.all([
        apiRequest('GET', `/api/search/users?q=${encodeURIComponent(q)}&limit=20`),
        apiRequest('GET', `/api/search/solos?q=${encodeURIComponent(q)}&limit=20`),
      ]);
      const [usersJson, solosJson] = await Promise.all([usersRes.json(), solosRes.json()]);

      if (usersJson.ok) setUserResults(usersJson.data.results);
      if (solosJson.ok) setSoloResults(solosJson.data.results);
    } catch {
      setUserResults([]);
      setSoloResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setUserResults([]);
      setSoloResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(text);
      saveRecentSearch(text);
    }, 400);
  };

  const handleRecentTap = (term: string) => {
    setQuery(term);
    performSearch(term);
  };

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderUserItem = ({ item }: { item: SearchUser }) => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.userRow}>
      <Avatar uri={item.avatarUrl} size={44} />
      <View style={styles.userInfo}>
        <Text variant="body" bold>@{item.username}</Text>
        {item.bio ? (
          <Text variant="caption" color={Colors.textDim} numberOfLines={1}>{item.bio}</Text>
        ) : null}
      </View>
    </Animated.View>
  );

  const renderSoloItem = ({ item }: { item: SearchSolo }) => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.soloRow}>
      <View style={styles.soloIcon}>
        <Ionicons name="musical-note" size={20} color={Colors.accent} />
      </View>
      <View style={styles.soloInfo}>
        <Text variant="body" bold numberOfLines={1}>{item.title}</Text>
        <View style={styles.soloMeta}>
          <Text variant="caption" color={Colors.textDim}>@{item.username}</Text>
          <View style={styles.dot} />
          <Text variant="caption" color={Colors.textMuted}>{formatDuration(item.durationMs)}</Text>
        </View>
        {item.tags?.length > 0 && (
          <View style={styles.tagRow}>
            {item.tags.slice(0, 3).map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text variant="caption" color={Colors.accent} style={{ fontSize: 10 }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );

  const renderSkeletonUsers = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonLine, { width: '50%' }]} />
            <View style={[styles.skeletonLine, { width: '80%' }]} />
          </View>
        </View>
      ))}
    </View>
  );

  const currentResults = activeTab === 'people' ? userResults : soloResults;
  const showEmpty = hasSearched && !isSearching && currentResults.length === 0;

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
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="search-input"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setUserResults([]); setSoloResults([]); setHasSearched(false); }} testID="clear-search">
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {query.length > 0 && (
          <View style={styles.tabs}>
            {(['people', 'sounds'] as const).map(tab => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                testID={`tab-${tab}`}
              >
                <Ionicons
                  name={tab === 'people' ? 'people-outline' : 'musical-notes-outline'}
                  size={14}
                  color={activeTab === tab ? Colors.bg : Colors.textDim}
                  style={{ marginRight: 4 }}
                />
                <Text variant="label" color={activeTab === tab ? Colors.bg : Colors.textDim}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {query.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 84 : 100 }}
          ListHeaderComponent={
            <View>
              {recentSearches.length > 0 && (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeader}>
                    <Text variant="label" color={Colors.textDim}>Recent Searches</Text>
                    <Pressable onPress={clearRecentSearches} testID="clear-recent">
                      <Text variant="caption" color={Colors.accent}>Clear</Text>
                    </Pressable>
                  </View>
                  {recentSearches.map((term, idx) => (
                    <Pressable key={`${term}-${idx}`} onPress={() => handleRecentTap(term)} style={styles.recentRow}>
                      <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                      <Text variant="body" color={Colors.text} style={{ flex: 1 }}>{term}</Text>
                      <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.sectionBlock}>
                <Text variant="label" color={Colors.accent} style={styles.sectionTitle}>Suggested Creators</Text>
                {trendingUsers.map(user => (
                  <View key={user.id} style={styles.userRow}>
                    <Avatar uri={user.avatarUrl} size={48} />
                    <View style={styles.userInfo}>
                      <Text variant="body" bold>@{user.username}</Text>
                      {user.bio ? (
                        <Text variant="caption" color={Colors.textDim} numberOfLines={1}>{user.bio}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {trendingUsers.length === 0 && (
                  <Text variant="caption" color={Colors.textMuted} style={{ marginTop: Spacing.md }}>
                    No creators yet
                  </Text>
                )}
              </View>
            </View>
          }
        />
      ) : isSearching ? (
        renderSkeletonUsers()
      ) : showEmpty ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={<Ionicons name="search-outline" size={28} color={Colors.accent} />}
            title={`No ${activeTab} found`}
            message={`Try a different search term`}
          />
        </View>
      ) : (
        <FlatList
          data={currentResults}
          keyExtractor={(item: any) => item.id}
          renderItem={activeTab === 'people' ? renderUserItem as any : renderSoloItem as any}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 84 : 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            currentResults.length > 0 ? (
              <View style={styles.resultsHeader}>
                <Text variant="caption" color={Colors.textDim}>
                  {activeTab === 'people' ? userResults.length : soloResults.length} result{currentResults.length !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
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
    gap: 8,
    marginTop: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  sectionBlock: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: Spacing.sm,
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
  soloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  soloIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soloInfo: {
    flex: 1,
  },
  soloMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  tagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  skeletonContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  resultsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
});
