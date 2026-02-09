import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  accent: string;
  accentMuted: string;
  bg: string;
  surface: string;
  surfaceLight: string;
  text: string;
  textDim: string;
  textMuted: string;
  danger: string;
  success: string;
  cardBg: string;
  cardBorder: string;
  overlay: string;
  headerBg: string;
  divider: string;
  inputBorder: string;
  chipBg: string;
  chipBorder: string;
  secondaryBtnBg: string;
  secondaryBtnBorder: string;
  accentSubtle: string;
  accentBorder: string;
  errorBg: string;
  tagActiveBg: string;
  modalOverlay: string;
  playhead: string;
  dimOverlay: string;
  handleGrip: string;
  vibeCollapsedBg: string;
  vibeCollapsedBorder: string;
  vibePanelBg: string;
  vibePanelBorder: string;
  transcriptBubbleBg: string;
  transcriptBubbleBorder: string;
  socialBorder: string;
  postBtnDisabledBg: string;
  postBtnDisabledText: string;
  lyricInactive: string;
  lyricPast: string;
  progressOverlay: string;
  tabBarBg: string;
  tabBarBorder: string;
}

const darkTheme: ThemeColors = {
  accent: '#FFD700',
  accentMuted: 'rgba(255, 215, 0, 0.15)',
  bg: '#000000',
  surface: '#111111',
  surfaceLight: '#1A1A1A',
  text: '#FFFFFF',
  textDim: '#888888',
  textMuted: '#555555',
  danger: '#FF4444',
  success: '#00CC66',
  cardBg: 'rgba(17, 17, 17, 0.5)',
  cardBorder: '#333333',
  overlay: 'rgba(0, 0, 0, 0.92)',
  headerBg: 'rgba(0, 0, 0, 0.92)',
  divider: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 215, 0, 0.1)',
  chipBg: 'rgba(255, 255, 255, 0.06)',
  chipBorder: 'rgba(255, 255, 255, 0.08)',
  secondaryBtnBg: 'rgba(255, 255, 255, 0.08)',
  secondaryBtnBorder: 'rgba(255, 255, 255, 0.12)',
  accentSubtle: 'rgba(255, 215, 0, 0.08)',
  accentBorder: 'rgba(255, 215, 0, 0.15)',
  errorBg: 'rgba(255, 68, 68, 0.1)',
  tagActiveBg: 'rgba(255, 215, 0, 0.15)',
  modalOverlay: 'rgba(0, 0, 0, 0.8)',
  playhead: '#FFFFFF',
  dimOverlay: 'rgba(0, 0, 0, 0.6)',
  handleGrip: 'rgba(0, 0, 0, 0.4)',
  vibeCollapsedBg: 'rgba(255, 255, 255, 0.05)',
  vibeCollapsedBorder: 'rgba(255, 255, 255, 0.08)',
  vibePanelBg: 'rgba(255, 215, 0, 0.04)',
  vibePanelBorder: 'rgba(255, 215, 0, 0.12)',
  transcriptBubbleBg: 'rgba(30, 30, 30, 0.95)',
  transcriptBubbleBorder: 'rgba(255, 215, 0, 0.25)',
  socialBorder: 'rgba(255, 255, 255, 0.06)',
  postBtnDisabledBg: 'rgba(255, 215, 0, 0.15)',
  postBtnDisabledText: 'rgba(0, 0, 0, 0.3)',
  lyricInactive: 'rgba(255, 255, 255, 0.25)',
  lyricPast: 'rgba(255, 255, 255, 0.6)',
  progressOverlay: 'rgba(255, 215, 0, 0.12)',
  tabBarBg: '#000000',
  tabBarBorder: 'rgba(255, 215, 0, 0.15)',
};

const lightTheme: ThemeColors = {
  accent: '#D4A800',
  accentMuted: 'rgba(212, 168, 0, 0.12)',
  bg: '#F5F5F0',
  surface: '#FFFFFF',
  surfaceLight: '#EBEBEB',
  text: '#1A1A1A',
  textDim: '#666666',
  textMuted: '#999999',
  danger: '#E53935',
  success: '#00A854',
  cardBg: '#FFFFFF',
  cardBorder: '#E0E0E0',
  overlay: 'rgba(245, 245, 240, 0.95)',
  headerBg: 'rgba(245, 245, 240, 0.95)',
  divider: 'rgba(0, 0, 0, 0.08)',
  inputBorder: 'rgba(212, 168, 0, 0.2)',
  chipBg: 'rgba(0, 0, 0, 0.04)',
  chipBorder: 'rgba(0, 0, 0, 0.08)',
  secondaryBtnBg: 'rgba(0, 0, 0, 0.05)',
  secondaryBtnBorder: 'rgba(0, 0, 0, 0.1)',
  accentSubtle: 'rgba(212, 168, 0, 0.08)',
  accentBorder: 'rgba(212, 168, 0, 0.2)',
  errorBg: 'rgba(229, 57, 53, 0.08)',
  tagActiveBg: 'rgba(212, 168, 0, 0.15)',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',
  playhead: '#1A1A1A',
  dimOverlay: 'rgba(245, 245, 240, 0.6)',
  handleGrip: 'rgba(255, 255, 255, 0.6)',
  vibeCollapsedBg: 'rgba(0, 0, 0, 0.04)',
  vibeCollapsedBorder: 'rgba(0, 0, 0, 0.08)',
  vibePanelBg: 'rgba(212, 168, 0, 0.06)',
  vibePanelBorder: 'rgba(212, 168, 0, 0.15)',
  transcriptBubbleBg: 'rgba(255, 255, 255, 0.95)',
  transcriptBubbleBorder: 'rgba(212, 168, 0, 0.3)',
  socialBorder: 'rgba(0, 0, 0, 0.08)',
  postBtnDisabledBg: 'rgba(212, 168, 0, 0.15)',
  postBtnDisabledText: 'rgba(255, 255, 255, 0.5)',
  lyricInactive: 'rgba(0, 0, 0, 0.2)',
  lyricPast: 'rgba(0, 0, 0, 0.55)',
  progressOverlay: 'rgba(212, 168, 0, 0.1)',
  tabBarBg: '#F5F5F0',
  tabBarBorder: 'rgba(212, 168, 0, 0.2)',
};

const THEME_STORAGE_KEY = 'solo_theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setMode(stored);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setTheme]);

  const value = useMemo(() => ({
    mode,
    colors: mode === 'dark' ? darkTheme : lightTheme,
    isDark: mode === 'dark',
    toggleTheme,
    setTheme,
  }), [mode, toggleTheme, setTheme]);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
