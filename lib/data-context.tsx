import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getApiUrl } from './query-client';
import { Platform } from 'react-native';

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
  uploadAndPost: (params: {
    audioUri: string;
    title: string;
    durationMs: number;
    tags?: string[];
  }) => Promise<void>;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  searchPosts: (query: string) => AudioPost[];
  searchUsers: (query: string) => UserProfile[];
  allUsers: UserProfile[];
  isUploading: boolean;
  refreshFeed: () => void;
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

interface ServerSolo {
  id: string;
  username: string;
  audioUrl: string;
  timestamp: string;
  tags: string[] | null;
  avatarUrl: string | null;
  title: string;
  durationMs: number;
  displayName: string | null;
}

function serverSoloToPost(solo: ServerSolo): AudioPost {
  const baseUrl = getApiUrl();
  const audioUri = solo.audioUrl.startsWith('/') ? `${baseUrl}${solo.audioUrl.slice(1)}` : solo.audioUrl;

  return {
    id: solo.id,
    userId: solo.username,
    username: solo.username,
    displayName: solo.displayName || solo.username,
    avatarUri: solo.avatarUrl,
    title: solo.title,
    audioUri,
    durationMs: solo.durationMs,
    teaserDurationMs: Math.min(60000, solo.durationMs),
    isRSS: false,
    likes: 0,
    liked: false,
    comments: [],
    createdAt: new Date(solo.timestamp).getTime(),
    waveformData: generateWaveform(),
  };
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
  const [localLikes, setLocalLikes] = useState<Set<string>>(new Set());
  const [localComments, setLocalComments] = useState<Record<string, Comment[]>>({});
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: serverSolos = [] } = useQuery<ServerSolo[]>({
    queryKey: ['/api/solos'],
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    AsyncStorage.getItem('solo_profile').then(data => {
      if (data) setCurrentUser(JSON.parse(data));
    });
    AsyncStorage.getItem('solo_following').then(data => {
      if (data) setFollowing(new Set(JSON.parse(data)));
    });
    AsyncStorage.getItem('solo_likes').then(data => {
      if (data) setLocalLikes(new Set(JSON.parse(data)));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('solo_profile', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    AsyncStorage.setItem('solo_following', JSON.stringify([...following]));
  }, [following]);

  useEffect(() => {
    AsyncStorage.setItem('solo_likes', JSON.stringify([...localLikes]));
  }, [localLikes]);

  const posts = useMemo(() => {
    return serverSolos.map(solo => {
      const post = serverSoloToPost(solo);
      post.liked = localLikes.has(post.id);
      post.likes = localLikes.has(post.id) ? 1 : 0;
      post.comments = localComments[post.id] || [];
      return post;
    });
  }, [serverSolos, localLikes, localComments]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setCurrentUser(prev => ({ ...prev, ...updates }));
  }, []);

  const addPost = useCallback((post: Omit<AudioPost, 'id' | 'likes' | 'liked' | 'comments' | 'createdAt' | 'waveformData'>) => {
    // kept for compatibility but uploadAndPost is preferred
  }, []);

  const uploadAndPost = useCallback(async (params: {
    audioUri: string;
    title: string;
    durationMs: number;
    tags?: string[];
  }) => {
    setIsUploading(true);
    try {
      const baseUrl = getApiUrl();
      const formData = new FormData();

      if (Platform.OS === 'web') {
        const response = await globalThis.fetch(params.audioUri);
        const blob = await response.blob();
        formData.append('audio', blob, 'recording.m4a');
      } else {
        const { File } = await import('expo-file-system');
        const file = new File(params.audioUri);
        formData.append('audio', file as any);
      }

      formData.append('username', currentUser.username);
      formData.append('displayName', currentUser.displayName);
      formData.append('title', params.title);
      formData.append('durationMs', params.durationMs.toString());
      if (params.tags) {
        formData.append('tags', JSON.stringify(params.tags));
      }
      if (currentUser.avatarUri) {
        formData.append('avatarUrl', currentUser.avatarUri);
      }

      const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;

      const res = await fetchFn(new URL('/api/solos', baseUrl).toString(), {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      queryClient.invalidateQueries({ queryKey: ['/api/solos'] });
    } finally {
      setIsUploading(false);
    }
  }, [currentUser, queryClient]);

  const toggleLike = useCallback((postId: string) => {
    setLocalLikes(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
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
    setLocalComments(prev => ({
      ...prev,
      [postId]: [...(prev[postId] || []), comment],
    }));
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

  const refreshFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/solos'] });
  }, [queryClient]);

  const value = useMemo(() => ({
    currentUser,
    updateProfile,
    posts,
    addPost,
    uploadAndPost,
    toggleLike,
    addComment,
    following,
    toggleFollow,
    searchPosts,
    searchUsers,
    allUsers: SAMPLE_USERS,
    isUploading,
    refreshFeed,
  }), [currentUser, updateProfile, posts, addPost, uploadAndPost, toggleLike, addComment, following, toggleFollow, searchPosts, searchUsers, isUploading, refreshFeed]);

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
