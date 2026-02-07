import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUri: string | null;
  followerCount: number;
  followingCount: number;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatarUri: string | null;
  text: string;
  createdAt: number;
}

export interface AudioPost {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUri: string | null;
  title: string;
  audioUri: string;
  durationMs: number;
  teaserDurationMs: number;
  isRSS: boolean;
  likes: number;
  liked: boolean;
  comments: Comment[];
  createdAt: number;
  waveformData: number[];
}

interface DataContextValue {
  currentUser: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  posts: AudioPost[];
  addPost: (post: Omit<AudioPost, 'id' | 'likes' | 'liked' | 'comments' | 'createdAt' | 'waveformData'>) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  searchPosts: (query: string) => AudioPost[];
  searchUsers: (query: string) => UserProfile[];
  allUsers: UserProfile[];
}

const DataContext = createContext<DataContextValue | null>(null);

function generateWaveform(length: number = 40): number[] {
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    data.push(0.15 + Math.random() * 0.85);
  }
  return data;
}

const SAMPLE_USERS: UserProfile[] = [
  { id: 'user_1', username: 'melodyjane', displayName: 'Melody Jane', bio: 'Singer-songwriter sharing daily vibes', avatarUri: null, followerCount: 2340, followingCount: 189 },
  { id: 'user_2', username: 'djthunder', displayName: 'DJ Thunder', bio: 'Electronic beats & bass drops', avatarUri: null, followerCount: 8900, followingCount: 432 },
  { id: 'user_3', username: 'podcastpro', displayName: 'Sarah Chen', bio: 'Daily tech podcast host', avatarUri: null, followerCount: 15600, followingCount: 312 },
  { id: 'user_4', username: 'acousticvibes', displayName: 'Marcus Bell', bio: 'Guitar loops & acoustic sessions', avatarUri: null, followerCount: 4200, followingCount: 267 },
  { id: 'user_5', username: 'voicenotes', displayName: 'Luna Park', bio: 'Storytelling through sound', avatarUri: null, followerCount: 6700, followingCount: 198 },
];

const DEMO_AUDIO = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

function createSamplePosts(): AudioPost[] {
  return [
    {
      id: 'post_1', userId: 'user_1', username: 'melodyjane', displayName: 'Melody Jane', avatarUri: null,
      title: 'Morning acoustic session', audioUri: DEMO_AUDIO, durationMs: 180000, teaserDurationMs: 60000,
      isRSS: false, likes: 234, liked: false,
      comments: [
        { id: 'c1', userId: 'user_2', username: 'djthunder', avatarUri: null, text: 'This is incredible!', createdAt: Date.now() - 3600000 },
        { id: 'c2', userId: 'user_4', username: 'acousticvibes', avatarUri: null, text: 'Love the chord progression', createdAt: Date.now() - 1800000 },
      ],
      createdAt: Date.now() - 7200000, waveformData: generateWaveform(),
    },
    {
      id: 'post_2', userId: 'user_2', username: 'djthunder', displayName: 'DJ Thunder', avatarUri: null,
      title: 'New bass drop preview', audioUri: DEMO_AUDIO, durationMs: 45000, teaserDurationMs: 45000,
      isRSS: false, likes: 892, liked: false,
      comments: [
        { id: 'c3', userId: 'user_5', username: 'voicenotes', avatarUri: null, text: 'The bass on this is insane', createdAt: Date.now() - 900000 },
      ],
      createdAt: Date.now() - 14400000, waveformData: generateWaveform(),
    },
    {
      id: 'post_3', userId: 'user_3', username: 'podcastpro', displayName: 'Sarah Chen', avatarUri: null,
      title: 'Tech Talk: The Future of AI', audioUri: DEMO_AUDIO, durationMs: 300000, teaserDurationMs: 60000,
      isRSS: true, likes: 1543, liked: false,
      comments: [
        { id: 'c4', userId: 'user_1', username: 'melodyjane', avatarUri: null, text: 'Such a great episode', createdAt: Date.now() - 600000 },
        { id: 'c5', userId: 'user_4', username: 'acousticvibes', avatarUri: null, text: 'Been waiting for this one!', createdAt: Date.now() - 300000 },
        { id: 'c6', userId: 'user_2', username: 'djthunder', avatarUri: null, text: 'Mind blown by the AI discussion', createdAt: Date.now() - 120000 },
      ],
      createdAt: Date.now() - 28800000, waveformData: generateWaveform(),
    },
    {
      id: 'post_4', userId: 'user_4', username: 'acousticvibes', displayName: 'Marcus Bell', avatarUri: null,
      title: 'Fingerpicking practice loop', audioUri: DEMO_AUDIO, durationMs: 120000, teaserDurationMs: 60000,
      isRSS: false, likes: 456, liked: false,
      comments: [],
      createdAt: Date.now() - 43200000, waveformData: generateWaveform(),
    },
    {
      id: 'post_5', userId: 'user_5', username: 'voicenotes', displayName: 'Luna Park', avatarUri: null,
      title: 'Midnight story: The Last Train', audioUri: DEMO_AUDIO, durationMs: 240000, teaserDurationMs: 60000,
      isRSS: true, likes: 2100, liked: false,
      comments: [
        { id: 'c7', userId: 'user_3', username: 'podcastpro', avatarUri: null, text: 'Your storytelling is unmatched', createdAt: Date.now() - 60000 },
      ],
      createdAt: Date.now() - 86400000, waveformData: generateWaveform(),
    },
  ];
}

const DEFAULT_USER: UserProfile = {
  id: 'me',
  username: 'soloist',
  displayName: 'Solo User',
  bio: 'Sharing sounds with the world',
  avatarUri: null,
  followerCount: 0,
  followingCount: 0,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_USER);
  const [posts, setPosts] = useState<AudioPost[]>(createSamplePosts());
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem('solo_profile').then(data => {
      if (data) setCurrentUser(JSON.parse(data));
    });
    AsyncStorage.getItem('solo_following').then(data => {
      if (data) setFollowing(new Set(JSON.parse(data)));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('solo_profile', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    AsyncStorage.setItem('solo_following', JSON.stringify([...following]));
  }, [following]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setCurrentUser(prev => ({ ...prev, ...updates }));
  }, []);

  const addPost = useCallback((post: Omit<AudioPost, 'id' | 'likes' | 'liked' | 'comments' | 'createdAt' | 'waveformData'>) => {
    const newPost: AudioPost = {
      ...post,
      id: Crypto.randomUUID(),
      likes: 0,
      liked: false,
      comments: [],
      createdAt: Date.now(),
      waveformData: generateWaveform(),
    };
    setPosts(prev => [newPost, ...prev]);
  }, []);

  const toggleLike = useCallback((postId: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
        : p
    ));
  }, []);

  const addComment = useCallback((postId: string, text: string) => {
    const comment: Comment = {
      id: Crypto.randomUUID(),
      userId: currentUser.id,
      username: currentUser.username,
      avatarUri: currentUser.avatarUri,
      text,
      createdAt: Date.now(),
    };
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
    ));
  }, [currentUser]);

  const toggleFollow = useCallback((userId: string) => {
    setFollowing(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const searchPosts = useCallback((query: string) => {
    const q = query.toLowerCase();
    return posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q)
    );
  }, [posts]);

  const searchUsers = useCallback((query: string) => {
    const q = query.toLowerCase();
    return SAMPLE_USERS.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
    );
  }, []);

  const value = useMemo(() => ({
    currentUser,
    updateProfile,
    posts,
    addPost,
    toggleLike,
    addComment,
    following,
    toggleFollow,
    searchPosts,
    searchUsers,
    allUsers: SAMPLE_USERS,
  }), [currentUser, updateProfile, posts, addPost, toggleLike, addComment, following, toggleFollow, searchPosts, searchUsers]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
