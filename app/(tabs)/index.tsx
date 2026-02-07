import React from 'react';
import { StyleSheet, FlatList, View, Text, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import SoundCard from '@/components/SoundCard';
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
          paddingTop: topInset + 60,
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
      <View style={[styles.headerBar, { paddingTop: topInset }]}>
        <Text style={styles.logo}>Solo</Text>
        <View style={styles.headerAccent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  logo: {
    fontSize: 28,
    fontFamily: 'DMSans_700Bold',
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  headerAccent: {
    height: 2,
    width: 40,
    backgroundColor: Colors.accent,
    borderRadius: 1,
    marginTop: 4,
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
