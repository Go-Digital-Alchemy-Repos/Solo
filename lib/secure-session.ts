import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'solo_auth_session';

let SecureStore: typeof import('expo-secure-store') | null = null;

async function getStore() {
  if (Platform.OS === 'web') return null;
  if (!SecureStore) {
    SecureStore = await import('expo-secure-store');
  }
  return SecureStore;
}

export async function getSessionCookie(): Promise<string | null> {
  try {
    const store = await getStore();
    if (store) {
      const value = await store.getItemAsync(SESSION_KEY);
      if (value) return value;
      const legacy = await AsyncStorage.getItem(SESSION_KEY);
      if (legacy) {
        await store.setItemAsync(SESSION_KEY, legacy);
        await AsyncStorage.removeItem(SESSION_KEY);
        return legacy;
      }
      return null;
    }
    return AsyncStorage.getItem(SESSION_KEY);
  } catch {
    return AsyncStorage.getItem(SESSION_KEY);
  }
}

export async function setSessionCookie(value: string): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.setItemAsync(SESSION_KEY, value);
      return;
    }
    await AsyncStorage.setItem(SESSION_KEY, value);
  } catch {
    await AsyncStorage.setItem(SESSION_KEY, value);
  }
}

export async function clearSessionCookie(): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.deleteItemAsync(SESSION_KEY);
    }
  } catch {}
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}
