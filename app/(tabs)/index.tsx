import React, { useCallback, useState } from 'react';
import { StyleSheet, FlatList, View, Text, Platform, StatusBar, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import { useData } from '@/lib/data-context';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { posts, refreshFeed } = useData();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshFeed();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refreshFeed]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SoundCard post={item} />}
        contentContainerStyle={{
          paddingTop: topInset + 56,
          paddingBottom: Platform.OS === 'web' ? 84 : 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
            progressViewOffset={topInset + 56}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="mic-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No solos yet</Text>
            <Text style={styles.emptyText}>Record your first solo to get started</Text>
          </View>
        }
      />
      <SoloHeader absolute />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.textDim,
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
});
