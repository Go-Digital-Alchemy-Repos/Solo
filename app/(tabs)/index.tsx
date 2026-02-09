import React, { useCallback, useState } from 'react';
import { StyleSheet, FlatList, View, Platform, StatusBar, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { EmptyState } from '@/components/ui';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import FeedTopicBar from '@/components/FeedTopicBar';
import { useData } from '@/lib/data-context';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { posts, refreshFeed, feedTag, setFeedTag } = useData();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const [refreshing, setRefreshing] = useState(false);
  const headerHeight = topInset + 90;

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
          paddingTop: headerHeight,
          paddingBottom: Platform.OS === 'web' ? 84 : 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
            progressViewOffset={headerHeight}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="mic-outline" size={28} color={Colors.accent} />}
            title="No solos yet"
            message={feedTag ? `No solos in ${feedTag} yet` : 'Record your first solo to get started'}
          />
        }
      />
      <SoloHeader
        absolute
        bottomContent={
          <FeedTopicBar selectedTag={feedTag} onSelectTag={setFeedTag} />
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
});
