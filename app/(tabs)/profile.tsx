import React, { useCallback, useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, FlatList, Platform, Alert, TextInput as RNTextInput, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Spacing, Radius, FontSize, FontFamily } from '@/constants/theme';
import { Text, EmptyState } from '@/components/ui';
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
    tags: solo.tags || [],
  };
}

const CATEGORY_OPTIONS = [
  'Sports', 'Politics', 'Business', 'Religion', 'Pop Culture',
  'Tech', 'Lifestyle', 'Music', 'Comedy', 'Health', 'News', 'Education',
];

async function authApiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl).toString();
  const sessionCookie = await AsyncStorage.getItem('solo_auth_session');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (sessionCookie) {
    headers['X-Session-Token'] = sessionCookie;
    if (Platform.OS !== 'web') {
      headers['Cookie'] = sessionCookie;
    }
  }
  const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
  return fetchFn(url, {
    ...options,
    headers,
    credentials: 'include' as RequestCredentials,
  } as any);
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

  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [editingSoloId, setEditingSoloId] = useState<string | null>(null);
  const [editSoloTitle, setEditSoloTitle] = useState('');
  const [editSoloTags, setEditSoloTags] = useState<string[]>([]);
  const [savingSolo, setSavingSolo] = useState(false);

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

  const handleDeleteSolo = useCallback((soloId: string) => {
    setMenuPostId(null);
    const doDelete = async () => {
      try {
        const res = await authApiFetch(`/api/solos/${soloId}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          Alert.alert('Error', data.error || 'Failed to delete');
          return;
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        queryClient.invalidateQueries({ queryKey: ['/api/solos/user', userId] });
        queryClient.invalidateQueries({ queryKey: ['/api/solos'] });
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to delete');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this Solo? This cannot be undone.')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Solo', 'Are you sure you want to delete this Solo? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [queryClient, userId]);

  const handleStartEditSolo = useCallback((soloId: string) => {
    setMenuPostId(null);
    const solo = serverSolos.find(s => s.id === soloId);
    if (solo) {
      setEditingSoloId(soloId);
      setEditSoloTitle(solo.title);
      setEditSoloTags(solo.tags || []);
    }
  }, [serverSolos]);

  const handleSaveEditSolo = useCallback(async () => {
    if (!editingSoloId || !editSoloTitle.trim()) return;
    setSavingSolo(true);
    try {
      const res = await authApiFetch(`/api/solos/${editingSoloId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editSoloTitle.trim(), tags: editSoloTags }),
      });
      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Error', data.error || 'Failed to save');
        return;
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setEditingSoloId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/solos/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/solos'] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSavingSolo(false);
    }
  }, [editingSoloId, editSoloTitle, editSoloTags, queryClient, userId]);

  const toggleEditTag = useCallback((tag: string) => {
    setEditSoloTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

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
            <Text variant="overline" color={Colors.accent}>Username</Text>
            <RNTextInput
              style={styles.editInput}
              value={editUsername}
              onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.editField}>
            <Text variant="overline" color={Colors.accent}>Bio</Text>
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
              <Text variant="label" color={Colors.textDim}>Cancel</Text>
            </Pressable>
            <Pressable onPress={saveEdits} style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.bg} size="small" /> : <Text variant="label" color={Colors.bg} bold>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text variant="h2">{currentUser.displayName}</Text>
          <Text variant="body" color={Colors.textDim} style={{ marginTop: 2 }}>@{currentUser.username}</Text>
          {!!currentUser.bio && <Text variant="body" color={Colors.textDim} align="center" style={styles.bio}>{currentUser.bio}</Text>}
        </>
      )}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text variant="h3" testID="post-count">{postCount}</Text>
          <Text variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>Sounds</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text variant="h3">{currentUser.followerCount}</Text>
          <Text variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text variant="h3">{currentUser.followingCount}</Text>
          <Text variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>Following</Text>
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
            <Text variant="label" color={Colors.accent}>Edit Profile</Text>
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.logoutBtn} testID="logout-btn">
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          </Pressable>
        </View>
      )}

      <Text variant="h3" style={styles.sectionTitle}>My Solos</Text>
    </View>
  );

  const renderPostItem = useCallback(({ item }: { item: AudioPost }) => (
    <View style={{ zIndex: menuPostId === item.id ? 10 : 0 }}>
      <View style={pStyles.menuRow}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuPostId(menuPostId === item.id ? null : item.id);
          }}
          hitSlop={12}
          style={pStyles.menuBtn}
          testID={`post-menu-${item.id}`}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textDim} />
        </Pressable>
      </View>
      {menuPostId === item.id && (
        <View style={pStyles.menuDropdown}>
          <Pressable
            onPress={() => handleStartEditSolo(item.id)}
            style={pStyles.menuItem}
            testID="edit-solo-btn"
          >
            <Feather name="edit-2" size={16} color={Colors.text} />
            <Text variant="body">Edit</Text>
          </Pressable>
          <View style={pStyles.menuDivider} />
          <Pressable
            onPress={() => handleDeleteSolo(item.id)}
            style={pStyles.menuItem}
            testID="delete-solo-btn"
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text variant="body" color={Colors.danger}>Delete</Text>
          </Pressable>
        </View>
      )}
      <SoundCard post={item} />
    </View>
  ), [menuPostId, handleStartEditSolo, handleDeleteSolo]);

  return (
    <View style={styles.container}>
      <SoloHeader />
      <FlatList
        data={myPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
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
            <EmptyState
              icon={<Ionicons name="musical-notes-outline" size={28} color={Colors.accent} />}
              title="No sounds recorded yet"
              message="Head to the Record tab to create your first sound"
            />
          )
        }
      />

      <Modal
        visible={editingSoloId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSoloId(null)}
      >
        <Pressable style={pStyles.modalOverlay} onPress={() => setEditingSoloId(null)}>
          <Pressable style={pStyles.modalContent} onPress={(e) => e.stopPropagation()} testID="edit-solo-modal">
            <View style={pStyles.modalHeader}>
              <Text variant="h3">Edit Solo</Text>
              <Pressable onPress={() => setEditingSoloId(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.textDim} />
              </Pressable>
            </View>

            <Text variant="overline" color={Colors.accent} style={{ marginBottom: 6 }}>Title</Text>
            <RNTextInput
              style={pStyles.titleInput}
              value={editSoloTitle}
              onChangeText={setEditSoloTitle}
              placeholder="Title"
              placeholderTextColor={Colors.textMuted}
              maxLength={100}
            />

            <Text variant="overline" color={Colors.accent} style={{ marginTop: Spacing.lg, marginBottom: 6 }}>Categories</Text>
            <View style={pStyles.tagsWrap}>
              {CATEGORY_OPTIONS.map(tag => (
                <Pressable
                  key={tag}
                  onPress={() => toggleEditTag(tag)}
                  style={[pStyles.tagChip, editSoloTags.includes(tag) && pStyles.tagChipActive]}
                >
                  <Text variant="bodySmall" color={editSoloTags.includes(tag) ? Colors.accent : Colors.textDim}>
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={pStyles.modalActions}>
              <Pressable
                onPress={() => setEditingSoloId(null)}
                style={pStyles.modalCancelBtn}
              >
                <Text variant="label" color={Colors.textDim}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEditSolo}
                style={[pStyles.modalSaveBtn, savingSolo && { opacity: 0.7 }]}
                disabled={savingSolo || !editSoloTitle.trim()}
              >
                {savingSolo ? (
                  <ActivityIndicator size="small" color={Colors.bg} />
                ) : (
                  <Text variant="label" color={Colors.bg} bold>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
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
  bio: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.xl,
  },
  stat: {
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSection: {
    width: '100%',
    marginTop: Spacing.xs,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  editField: {
    gap: Spacing.xs,
  },
  editInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
  },
  editActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
    paddingHorizontal: 40,
    gap: Spacing.sm,
  },
});

const pStyles = StyleSheet.create({
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 0,
  },
  menuBtn: {
    padding: 6,
  },
  menuDropdown: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  titleInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tagChipActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: Colors.accent,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xxl,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
});
