import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

interface Vibe {
  id: string;
  label: string;
  icon: string;
}

const VIBES: Vibe[] = [
  { id: 'coffee-shop', label: 'Coffee Shop', icon: 'coffee' },
  { id: 'nature', label: 'Nature', icon: 'tree' },
  { id: 'lofi-beat', label: 'Lofi Beat', icon: 'music' },
];

interface VibeSelectorProps {
  selectedVibe: string | null;
  onSelect: (vibeId: string | null) => void;
  isRecording: boolean;
}

export default function VibeSelector({ selectedVibe, onSelect, isRecording }: VibeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const vibeSound = useRef<Audio.Sound | null>(null);

  const stopVibePreview = useCallback(async () => {
    if (vibeSound.current) {
      try {
        await vibeSound.current.stopAsync();
        await vibeSound.current.unloadAsync();
      } catch {}
      vibeSound.current = null;
    }
  }, []);

  const startVibePlayback = useCallback(async (vibeId: string) => {
    await stopVibePreview();
    try {
      const baseUrl = getApiUrl();
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${baseUrl}api/vibes/${vibeId}/audio` },
        { shouldPlay: true, isLooping: true, volume: 0.1 }
      );
      vibeSound.current = sound;
    } catch (e) {
      console.error('Failed to play vibe:', e);
    }
  }, [stopVibePreview]);

  useEffect(() => {
    if (isRecording && selectedVibe) {
      const timer = setTimeout(() => {
        startVibePlayback(selectedVibe);
      }, 300);
      return () => clearTimeout(timer);
    } else if (!isRecording) {
      stopVibePreview();
    }
  }, [isRecording, selectedVibe]);

  useEffect(() => {
    return () => {
      stopVibePreview();
    };
  }, []);

  const handleSelect = useCallback(async (vibeId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (selectedVibe === vibeId) {
      onSelect(null);
      await stopVibePreview();
    } else {
      onSelect(vibeId);
      if (!isRecording) {
        await startVibePlayback(vibeId);
        setTimeout(() => stopVibePreview(), 3000);
      }
    }
  }, [selectedVibe, onSelect, isRecording, startVibePlayback, stopVibePreview]);

  const getVibeIcon = (iconName: string) => {
    switch (iconName) {
      case 'coffee': return <MaterialCommunityIcons name="coffee" size={16} color={Colors.accent} />;
      case 'tree': return <Ionicons name="leaf" size={16} color="#4CAF50" />;
      case 'music': return <MaterialCommunityIcons name="music-note" size={16} color="#9C27B0" />;
      default: return <Ionicons name="musical-note" size={16} color={Colors.textDim} />;
    }
  };

  const selectedLabel = VIBES.find(v => v.id === selectedVibe)?.label;

  if (!isExpanded) {
    return (
      <Pressable onPress={() => setIsExpanded(true)} style={styles.collapsedContainer}>
        <Ionicons name="musical-notes-outline" size={16} color={selectedVibe ? Colors.accent : Colors.textDim} />
        <Text style={[styles.collapsedLabel, selectedVibe && { color: Colors.accent }]}>
          {selectedVibe ? selectedLabel : 'Vibes'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="musical-notes" size={16} color={Colors.accent} />
          <Text style={styles.headerLabel}>Background Vibes</Text>
        </View>
        <Pressable onPress={() => setIsExpanded(false)}>
          <Ionicons name="chevron-up" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Mixed at 10% volume into your recording</Text>
      <View style={styles.vibeRow}>
        <Pressable
          onPress={() => { onSelect(null); stopVibePreview(); }}
          style={[styles.vibeChip, !selectedVibe && styles.vibeChipActive]}
        >
          <Ionicons name="volume-mute" size={14} color={!selectedVibe ? Colors.bg : Colors.textDim} />
          <Text style={[styles.vibeChipText, !selectedVibe && styles.vibeChipTextActive]}>None</Text>
        </Pressable>
        {VIBES.map(vibe => {
          const isSelected = selectedVibe === vibe.id;
          return (
            <Pressable
              key={vibe.id}
              onPress={() => handleSelect(vibe.id)}
              style={[styles.vibeChip, isSelected && styles.vibeChipActive]}
              disabled={isRecording}
            >
              {getVibeIcon(vibe.icon)}
              <Text style={[styles.vibeChipText, isSelected && styles.vibeChipTextActive]}>{vibe.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  collapsedLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  container: {
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.12)',
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLabel: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
  vibeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  vibeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vibeChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  vibeChipText: {
    color: Colors.textDim,
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  vibeChipTextActive: {
    color: Colors.bg,
    fontFamily: 'DMSans_700Bold',
  },
});
