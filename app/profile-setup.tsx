import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        setAvatarUri(result.assets[0].uri);
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
            setAvatarUri(result.assets[0].uri);
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
            setAvatarUri(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleComplete = useCallback(async () => {
    setError('');
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedUsername) {
      setError('Please choose a username');
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setError('Username must be 3-20 characters (letters, numbers, underscores)');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const formData = new FormData();
      formData.append('username', trimmedUsername);
      if (bio.trim()) {
        formData.append('bio', bio.trim());
      }

      if (avatarUri) {
        if (Platform.OS === 'web') {
          const response = await globalThis.fetch(avatarUri);
          const blob = await response.blob();
          formData.append('avatar', blob, 'avatar.jpg');
        } else {
          const { File } = await import('expo-file-system');
          const file = new File(avatarUri);
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
        throw new Error(data.error || 'Failed to update profile');
      }

      const updated = await res.json();
      updateUser(updated);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  }, [username, bio, avatarUri, updateUser]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 40, paddingBottom: bottomInset + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Set Up Your Profile</Text>
          <Text style={styles.subtitle}>Choose a username and add a photo so others can find you</Text>
        </View>

        <Pressable onPress={pickImage} style={styles.avatarPicker}>
          {avatarUri ? (
            <Avatar uri={avatarUri} size={100} borderWidth={3} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={32} color={Colors.accent} />
            </View>
          )}
          <Text style={styles.avatarLabel}>
            {avatarUri ? 'Change Photo' : 'Add Photo'}
          </Text>
        </Pressable>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="yourname"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                testID="username-input"
              />
            </View>
            <Text style={styles.hint}>3-20 characters, letters, numbers, underscores</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio (optional)</Text>
            <TextInput
              style={styles.bioInput}
              placeholder="Tell others about yourself..."
              placeholderTextColor={Colors.textMuted}
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={160}
              testID="bio-input"
            />
            <Text style={styles.charCount}>{bio.length}/160</Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleComplete}
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            disabled={loading}
            testID="complete-setup-btn"
          >
            {loading ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={styles.submitText}>Complete Setup</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontFamily: 'DMSans_700Bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    color: Colors.textDim,
    marginTop: 8,
    lineHeight: 22,
  },
  avatarPicker: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 10,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
    color: Colors.accent,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
    color: Colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.1)',
  },
  atSign: {
    fontSize: 18,
    fontFamily: 'DMSans_600SemiBold',
    color: Colors.accent,
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    color: Colors.textMuted,
  },
  bioInput: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.1)',
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    color: Colors.textMuted,
    alignSelf: 'flex-end',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    flex: 1,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    fontSize: 17,
    fontFamily: 'DMSans_700Bold',
    color: Colors.bg,
  },
});
