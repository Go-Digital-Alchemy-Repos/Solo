import React from 'react';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useEffect } from 'react';

function PulseRing() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
        withTiming(0.4, { duration: 0 }),
      ),
      -1,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.pulseRing, style]} />;
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: topInset + 60 }]}>
        <View style={styles.logoContainer}>
          <PulseRing />
          <View style={styles.logoCircle}>
            <Ionicons name="radio" size={40} color={Colors.bg} />
          </View>
        </View>

        <Text style={styles.title}>Solo</Text>
        <Text style={styles.subtitle}>Share your sound with the world</Text>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <Ionicons name="mic-outline" size={20} color={Colors.accent} />
            <Text style={styles.featureText}>Record audio up to 5 minutes</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="people-outline" size={20} color={Colors.accent} />
            <Text style={styles.featureText}>Discover sounds from creators</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="heart-outline" size={20} color={Colors.accent} />
            <Text style={styles.featureText}>Like, comment, and follow</Text>
          </View>
        </View>
      </View>

      <View style={[styles.bottomSection, { paddingBottom: bottomInset + 20 }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/auth');
          }}
          style={styles.getStartedBtn}
        >
          <Text style={styles.getStartedText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.bg} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 42,
    fontFamily: 'DMSans_700Bold',
    color: Colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    color: Colors.textDim,
    marginTop: 8,
    textAlign: 'center',
  },
  featureList: {
    marginTop: 48,
    gap: 20,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 8,
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'DMSans_500Medium',
    color: Colors.textDim,
  },
  bottomSection: {
    paddingHorizontal: 32,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 28,
  },
  getStartedText: {
    fontSize: 17,
    fontFamily: 'DMSans_700Bold',
    color: Colors.bg,
  },
});
