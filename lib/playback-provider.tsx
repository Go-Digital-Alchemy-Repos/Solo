import React, { createContext, useContext, useState, useRef, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Platform } from 'react-native';

interface PlaybackState {
  currentPostId: string | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isLoading: boolean;
  isBuffering: boolean;
}

interface PlaybackContextValue {
  state: PlaybackState;
  play: (postId: string, uri: string, startPosition?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionMillis: number) => Promise<void>;
  savedPositions: Record<string, number>;
  preload: (uri: string) => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

const INITIAL_STATE: PlaybackState = {
  currentPostId: null,
  isPlaying: false,
  positionMillis: 0,
  durationMillis: 0,
  isLoading: false,
  isBuffering: false,
};

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [savedPositions, setSavedPositions] = useState<Record<string, number>>({});
  const preloadedRef = useRef<Set<string>>(new Set());
  const currentPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  const cleanup = useCallback(async () => {
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && currentPostIdRef.current) {
          setSavedPositions(prev => ({
            ...prev,
            [currentPostIdRef.current!]: status.positionMillis,
          }));
        }
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const play = useCallback(async (postId: string, uri: string, startPosition?: number) => {
    if (currentPostIdRef.current === postId && soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (startPosition !== undefined) {
            await soundRef.current.setPositionAsync(startPosition);
          }
          await soundRef.current.playAsync();
          return;
        }
      } catch {}
    }

    setState(prev => ({ ...prev, isLoading: true, currentPostId: postId }));
    currentPostIdRef.current = postId;
    await cleanup();

    try {
      const initialPosition = startPosition ?? savedPositions[postId] ?? 0;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          positionMillis: initialPosition,
          progressUpdateIntervalMillis: 100,
        },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setState(prev => ({
              ...prev,
              isPlaying: status.isPlaying,
              positionMillis: status.positionMillis,
              durationMillis: status.durationMillis ?? 0,
              isLoading: false,
              isBuffering: status.isBuffering ?? false,
            }));
            if (status.didJustFinish) {
              currentPostIdRef.current = null;
              setState(prev => ({
                ...prev,
                isPlaying: false,
                currentPostId: null,
              }));
              setSavedPositions(prev => {
                const next = { ...prev };
                delete next[postId];
                return next;
              });
            }
          }
        }
      );
      soundRef.current = sound;
      setState(prev => ({
        ...prev,
        currentPostId: postId,
        isPlaying: true,
        isLoading: false,
      }));
    } catch (e) {
      console.error('Playback error:', e);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [cleanup, savedPositions]);

  const pause = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
      } catch {}
    }
  }, []);

  const resume = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.playAsync();
      } catch {}
    }
  }, []);

  const stop = useCallback(async () => {
    currentPostIdRef.current = null;
    await cleanup();
    setState(INITIAL_STATE);
  }, [cleanup]);

  const seekTo = useCallback(async (positionMillis: number) => {
    if (soundRef.current) {
      try {
        await soundRef.current.setPositionAsync(positionMillis);
      } catch {}
    }
  }, []);

  const preload = useCallback((uri: string) => {
    if (preloadedRef.current.has(uri)) return;
    preloadedRef.current.add(uri);
    if (Platform.OS === 'web') {
      const audio = new globalThis.Audio();
      audio.preload = 'metadata';
      audio.src = uri;
    }
    if (preloadedRef.current.size > 20) {
      const first = preloadedRef.current.values().next().value;
      if (first) preloadedRef.current.delete(first);
    }
  }, []);

  const value = useMemo(() => ({
    state,
    play,
    pause,
    resume,
    stop,
    seekTo,
    savedPositions,
    preload,
  }), [state, play, pause, resume, stop, seekTo, savedPositions, preload]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider');
  return ctx;
}
