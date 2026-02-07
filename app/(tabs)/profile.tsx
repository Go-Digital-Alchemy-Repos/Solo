import React, { useCallback, useState, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, FlatList, Platform, Alert, TextInput as RNTextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import Avatar from '@/components/Avatar';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import { useData, AudioPost } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';

interface ServerSolo {
  id: string;
  userId: string;
  username: string;
  audioUrl: string;
  timestamp: string;
  tags: string[] | null;
  avatarUrl: string | null;
  title: string;
  durationMs: number;
  displayName: string | null;
}

function generateWaveform(length: number = 40): number[] {
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    data.push(0.15 + Math.random() * 0.85);
  }
  return data;
}

function serverSoloToPost(solo: ServerSolo): AudioPost {
  const baseUrl = getApiUrl();
  const audioUri = solo.audioUrl.startsWith('/') ? `${baseUrl}${solo.audioUrl.slice(1)}` : solo.audioUrl;
  const avatarUri = solo.avatarUrl?.startsWith('/') ? `${baseUrl}${solo.avatarUrl.slice(1)}` : solo.avatarUrl;

  return {
    id: solo.id,
    userId: solo.userId || solo.username,
    username: solo.username,
    displayName: solo.displayName || solo.username,
    avatarUri: avatarUri || null,
    title: solo.title,
    audioUri,
    durationMs: solo.durationMs,
    teaserDurationMs: Math.min(60000, solo.durationMs),
    isRSS: false,
    likes: 0,
    liked: false,
    comments: [],
    createdAt: new Date(solo.timestamp).getTime(),
    waveformData: generateWaveform(),
  };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useData();
  const { user: authUser, logout, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(currentUser.username);
  const [editBio, setEditBio] = useState(currentUser.bio);
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userId = authUser?.id;

  const { data: serverSolos = [], isLoading, refetch, isRefetching } = useQuery<ServerSolo[]>({
    queryKey: ['/api/solos/user', userId],
    queryFn: async () => {
      if (!userId) return [];
      const baseUrl = getApiUrl();
      const res = await fetch(new URL(`/api/solos/user/${userId}`, baseUrl).toString());
      if (!res.ok) throw new Error('Failed to fetch solos');
      return res.json();
    },
    enabled: !!userId,
    staleTime: 5000,
  });

  const myPosts = useMemo(() => serverSolos.map(serverSoloToPost), [serverSolos]);
  const postCount = myPosts.length;

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['/api/solos'] });
  }, [refetch, queryClient]);

  const pickImage = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setEditAvatarUri(result.assets[0].uri);
      }
      return;
    }

    Alert.alert('Profile Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setEditAvatarUri(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setEditAvatarUri(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const saveEdits = useCallback(async () => {
    setSaving(true);
    try {
      const baseUrl = getApiUrl();
      const formData = new FormData();

      const trimmedUsername = editUsername.trim().toLowerCase();
      if (trimmedUsername && trimmedUsername !== currentUser.username) {
        formData.append('username', trimmedUsername);
      }
      formData.append('bio', editBio.trim());

      if (editAvatarUri) {
        if (Platform.OS === 'web') {
          const response = await globalThis.fetch(editAvatarUri);
          const blob = await response.blob();
          formData.append('avatar', blob, 'avatar.jpg');
        } else {
          const { File } = await import('expo-file-system');
          const file = new File(editAvatarUri);
          formData.append('avatar', file as any);
        }
      }

      const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
      const res = await fetchFn(new URL('/api/auth/profile', baseUrl).toString(), {
        method: 'PUT',
        body: formData,
        credentials: 'include',
      } as any);

      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Error', data.error || 'Failed to update profile');
        return;
      }

      const updated = await res.json();
      updateUser(updated);
      setIsEditing(false);
      setEditAvatarUri(null);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editUsername, editBio, editAvatarUri, currentUser, updateUser]);

  const startEditing = useCallback(() => {
    setEditUsername(currentUser.username);
    setEditBio(currentUser.bio);
    setEditAvatarUri(null);
    setIsEditing(true);
  }, [currentUser]);

  const handleLogout = useCallback(async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (confirmed) {
        await logout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
          },
        },
      ]);
    }
  }, [logout]);

  const ProfileHeader = () => (
    <View style={styles.profileSection}>
      <Pressable onPress={isEditing ? pickImage : undefined} style={styles.avatarContainer}>
        <Avatar uri={editAvatarUri || currentUser.avatarUri} size={90} borderWidth={3} />
        {isEditing && (
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={16} color={Colors.bg} />
          </View>
        )}
      </Pressable>

      {isEditing ? (
        <View style={styles.editSection}>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Username</Text>
            <RNTextInput
              style={styles.editInput}
              value={editUsername}
              onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Bio</Text>
            <RNTextInput
              style={[styles.editInput, { minHeight: 60 }]}
              value={editBio}
              onChangeText={setEditBio}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={160}
            />
          </View>
          <View style={styles.editActions}>
            <Pressable onPress={() => { setIsEditing(false); setEditAvatarUri(null); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={saveEdits} style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.bg} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.displayName}>{currentUser.displayName}</Text>
          <Text style={styles.username}>@{currentUser.username}</Text>
          {!!currentUser.bio && <Text style={styles.bio}>{currentUser.bio}</Text>}
        </>
      )}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber} testID="post-count">{postCount}</Text>
          <Text style={styles.statLabel}>Sounds</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{currentUser.followerCount}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{currentUser.followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      {!isEditing && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              startEditing();
            }}
            style={styles.editBtn}
          >
            <Feather name="edit-2" size={16} color={Colors.accent} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.logoutBtn} testID="logout-btn">
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>My Solos</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SoloHeader />
      <FlatList
        data={myPosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SoundCard post={item} />}
        ListHeaderComponent={ProfileHeader}
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 84 : 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
            progressBackgroundColor={Colors.surface}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={Colors.accent} size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No sounds recorded yet</Text>
              <Text style={styles.emptySubtext}>Head to the Record tab to create your first sound</Text>
            </View>
          )
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
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  displayName: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: 'DMSans_700Bold',
  },
  username: {
    color: Colors.textDim,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    marginTop: 2,
  },
  bio: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 20,
  },
  stat: {
    alignItems: 'center',
  },
  statNumber: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: 'DMSans_700Bold',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  editBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSection: {
    width: '100%',
    marginTop: 4,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    gap: 12,
  },
  editField: {
    gap: 4,
  },
  editLabel: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  editInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Colors.textDim,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  saveBtnText: {
    color: Colors.bg,
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    alignSelf: 'flex-start',
    marginTop: 24,
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: 16,
    fontFamily: 'DMSans_500Medium',
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
});
