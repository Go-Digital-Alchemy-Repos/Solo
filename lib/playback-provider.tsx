import React, { createContext, useContext, useState, useRef, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

interface PlaybackState {
  currentPostId: string | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isLoading: boolean;
}

interface PlaybackContextValue {
  state: PlaybackState;
  play: (postId: string, uri: string, startPosition?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionMillis: number) => Promise<void>;
  savedPositions: Record<string, number>;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<PlaybackState>({
    currentPostId: null,
    isPlaying: false,
    positionMillis: 0,
    durationMillis: 0,
    isLoading: false,
  });
  const [savedPositions, setSavedPositions] = useState<Record<string, number>>({});

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
        if (status.isLoaded && state.currentPostId) {
          setSavedPositions(prev => ({
            ...prev,
            [state.currentPostId!]: status.positionMillis,
          }));
        }
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, [state.currentPostId]);

  const play = useCallback(async (postId: string, uri: string, startPosition?: number) => {
    setState(prev => ({ ...prev, isLoading: true }));
    await cleanup();

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          positionMillis: startPosition ?? savedPositions[postId] ?? 0,
        },
        (status) => {
          if (status.isLoaded) {
            setState(prev => ({
              ...prev,
              isPlaying: status.isPlaying,
              positionMillis: status.positionMillis,
              durationMillis: status.durationMillis ?? 0,
              isLoading: false,
            }));
            if (status.didJustFinish) {
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
      await soundRef.current.pauseAsync();
    }
  }, []);

  const resume = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.playAsync();
    }
  }, []);

  const stop = useCallback(async () => {
    await cleanup();
    setState({
      currentPostId: null,
      isPlaying: false,
      positionMillis: 0,
      durationMillis: 0,
      isLoading: false,
    });
  }, [cleanup]);

  const seekTo = useCallback(async (positionMillis: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(positionMillis);
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
  }), [state, play, pause, resume, stop, seekTo, savedPositions]);

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
