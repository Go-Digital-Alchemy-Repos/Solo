import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { PlaybackProvider } from "@/lib/playback-provider";
import { DataProvider } from "@/lib/data-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { DmProvider } from "@/lib/dm-context";
import { ToastProvider } from "@/components/ui";

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { user, isLoading, isAuthenticated, needsProfileSetup } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentSegment = segments[0] as string;
    const inAuthGroup = currentSegment === 'auth' || currentSegment === 'welcome';
    const inProfileSetup = currentSegment === 'profile-setup';

    if (!isAuthenticated) {
      if (!inAuthGroup && currentSegment !== 'welcome') {
        router.replace('/welcome' as any);
      }
    } else if (needsProfileSetup) {
      if (!inProfileSetup) {
        router.replace('/profile-setup' as any);
      }
    } else {
      if (inAuthGroup || currentSegment === 'welcome' || inProfileSetup) {
        router.replace('/(tabs)' as any);
      }
    }
  }, [isLoading, isAuthenticated, needsProfileSetup, segments]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="messages" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
            <KeyboardProvider>
              <AuthProvider>
                <DataProvider>
                  <DmProvider>
                    <PlaybackProvider>
                      <ToastProvider>
                        <StatusBar style="light" />
                        <RootLayoutNav />
                      </ToastProvider>
                    </PlaybackProvider>
                  </DmProvider>
                </DataProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
