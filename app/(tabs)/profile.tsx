import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Text, Pressable, FlatList, Platform, Alert, TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons, Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import Avatar from '@/components/Avatar';
import SoundCard from '@/components/SoundCard';
import SoloHeader from '@/components/SoloHeader';
import { useData } from '@/lib/data-context';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, updateProfile, posts } = useData();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentUser.displayName);
  const [editUsername, setEditUsername] = useState(currentUser.username);
  const [editBio, setEditBio] = useState(currentUser.bio);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const myPosts = posts.filter(p => p.userId === currentUser.id);

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
        updateProfile({ avatarUri: result.assets[0].uri });
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
            updateProfile({ avatarUri: result.assets[0].uri });
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
            updateProfile({ avatarUri: result.assets[0].uri });
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [updateProfile]);

  const saveEdits = useCallback(() => {
    updateProfile({
      displayName: editName.trim() || currentUser.displayName,
      username: editUsername.trim() || currentUser.username,
      bio: editBio.trim(),
    });
    setIsEditing(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [editName, editUsername, editBio, updateProfile, currentUser]);

  const startEditing = useCallback(() => {
    setEditName(currentUser.displayName);
    setEditUsername(currentUser.username);
    setEditBio(currentUser.bio);
    setIsEditing(true);
  }, [currentUser]);

  const ProfileHeader = () => (
    <View style={styles.profileSection}>
      <Pressable onPress={pickImage} style={styles.avatarContainer}>
        <Avatar uri={currentUser.avatarUri} size={90} borderWidth={3} />
        <View style={styles.cameraIcon}>
          <Ionicons name="camera" size={16} color={Colors.bg} />
        </View>
      </Pressable>

      {isEditing ? (
        <View style={styles.editSection}>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Display Name</Text>
            <RNTextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Username</Text>
            <RNTextInput
              style={styles.editInput}
              value={editUsername}
              onChangeText={setEditUsername}
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
            />
          </View>
          <View style={styles.editActions}>
            <Pressable onPress={() => setIsEditing(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={saveEdits} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.displayName}>{currentUser.displayName}</Text>
          <Text style={styles.username}>@{currentUser.username}</Text>
          <Text style={styles.bio}>{currentUser.bio}</Text>
        </>
      )}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{myPosts.length}</Text>
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
      )}

      {myPosts.length > 0 && (
        <Text style={styles.sectionTitle}>Your Sounds</Text>
      )}
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No sounds recorded yet</Text>
            <Text style={styles.emptySubtext}>Head to the Record tab to create your first sound</Text>
          </View>
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
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
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
