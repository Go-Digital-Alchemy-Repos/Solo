import React from 'react';
import { StyleSheet, FlatList, View, Text, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import { useData } from '@/lib/data-context';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { posts } = useData();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

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
        ListHeaderComponent={null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sounds yet</Text>
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
    paddingTop: 100,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
});
