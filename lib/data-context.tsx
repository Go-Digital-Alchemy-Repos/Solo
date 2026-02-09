import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiUrl } from './query-client';
import { Platform } from 'react-native';
import { useAuth } from './auth-context';

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

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: TranscriptWord[];
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
  transcript: Transcript | null;
  tags: string[];
}

export interface SoloStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  processingStep: 'upload' | 'trim' | 'mix' | 'transcribe' | 'done';
  processingError: string | null;
  attempts: number;
  readyAt: string | null;
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
    trimStartMs?: number;
    trimEndMs?: number;
    vibeId?: string;
  }) => Promise<string>;
  pollSoloStatus: (soloId: string) => Promise<SoloStatusResponse>;
  retrySolo: (soloId: string) => Promise<string>;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  searchPosts: (query: string) => AudioPost[];
  searchUsers: (query: string) => UserProfile[];
  allUsers: UserProfile[];
  isUploading: boolean;
  refreshFeed: () => void;
  feedTag: string | null;
  setFeedTag: (tag: string | null) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function generateWaveform(length: number = 70): number[] {
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    data.push(0.15 + Math.random() * 0.85);
  }
  return data;
}

interface ServerSolo {
  id: string;
  userId: string;
  username: string;
  audioUrl: string;
  timestamp: string;
  tags: string[] | null;
  avatarUrl: string | null;
  title: string;
  durationMs: number;
  displayName: string | null;
  transcript: Transcript | null;
}

function serverSoloToPost(solo: ServerSolo): AudioPost {
  const baseUrl = getApiUrl();
  const audioUri = solo.audioUrl.startsWith('/') ? `${baseUrl}${solo.audioUrl.slice(1)}` : solo.audioUrl;
  const avatarUri = solo.avatarUrl?.startsWith('/') ? `${baseUrl}${solo.avatarUrl.slice(1)}` : solo.avatarUrl;

  return {
    id: solo.id,
    userId: solo.userId || solo.username,
    username: solo.username,
    displayName: solo.displayName || solo.username,
    avatarUri: avatarUri || null,
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
    transcript: solo.transcript || null,
    tags: solo.tags || [],
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();

  const currentUser = useMemo<UserProfile>(() => {
    if (!authUser || !authUser.username) {
      return {
        id: 'anonymous',
        username: 'anonymous',
        displayName: 'Anonymous',
        bio: '',
        avatarUri: null,
        followerCount: 0,
        followingCount: 0,
      };
    }
    const baseUrl = getApiUrl();
    const avatarUri = authUser.avatarUrl?.startsWith('/') ? `${baseUrl}${authUser.avatarUrl.slice(1)}` : authUser.avatarUrl;
    return {
      id: authUser.id,
      username: authUser.username,
      displayName: authUser.username,
      bio: authUser.bio || '',
      avatarUri: avatarUri || null,
      followerCount: 0,
      followingCount: 0,
    };
  }, [authUser]);

  const [localLikes, setLocalLikes] = useState<Set<string>>(new Set());
  const [localComments, setLocalComments] = useState<Record<string, Comment[]>>({});
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [feedTag, setFeedTag] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const solosQueryKey = feedTag ? `/api/solos?tag=${feedTag}` : '/api/solos';
  const { data: serverSolos = [] } = useQuery<ServerSolo[]>({
    queryKey: [solosQueryKey],
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    AsyncStorage.getItem('solo_following').then(data => {
      if (data) setFollowing(new Set(JSON.parse(data)));
    });
    AsyncStorage.getItem('solo_likes').then(data => {
      if (data) setLocalLikes(new Set(JSON.parse(data)));
    });
  }, []);

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

  const updateProfile = useCallback((_updates: Partial<UserProfile>) => {
  }, []);

  const addPost = useCallback((_post: Omit<AudioPost, 'id' | 'likes' | 'liked' | 'comments' | 'createdAt' | 'waveformData'>) => {
  }, []);

  const uploadAndPost = useCallback(async (params: {
    audioUri: string;
    title: string;
    durationMs: number;
    tags?: string[];
    trimStartMs?: number;
    trimEndMs?: number;
    vibeId?: string;
  }): Promise<string> => {
    setIsUploading(true);
    try {
      const baseUrl = getApiUrl();
      const formData = new FormData();

      if (Platform.OS === 'web') {
        try {
          const response = await globalThis.fetch(params.audioUri);
          const blob = await response.blob();
          formData.append('audio', new globalThis.File([blob], 'recording.m4a', { type: 'audio/mp4' }));
        } catch (blobErr: any) {
          console.error('Failed to read recording blob:', blobErr?.message);
          throw new Error('Could not read recorded audio. Please try recording again.');
        }
      } else {
        const { File } = await import('expo-file-system');
        const file = new File(params.audioUri);
        formData.append('audio', file as any);
      }

      formData.append('title', params.title);
      formData.append('durationMs', params.durationMs.toString());
      if (params.tags) {
        formData.append('tags', JSON.stringify(params.tags));
      }
      if (params.trimStartMs !== undefined && params.trimEndMs !== undefined) {
        formData.append('trimStartMs', params.trimStartMs.toString());
        formData.append('trimEndMs', params.trimEndMs.toString());
      }
      if (params.vibeId) {
        formData.append('vibeId', params.vibeId);
      }

      const headers: Record<string, string> = {};
      const sessionCookie = await AsyncStorage.getItem('solo_auth_session');
      if (sessionCookie) {
        headers['X-Session-Token'] = sessionCookie;
        if (Platform.OS !== 'web') {
          headers['Cookie'] = sessionCookie;
        }
      }

      const uploadUrl = new URL('/api/solos', baseUrl).toString();
      console.log('Uploading to:', uploadUrl);

      const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;

      const res = await fetchFn(uploadUrl, {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
      } as any);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Upload response error:', res.status, errorText);
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await res.json();
      return data.id as string;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const pollSoloStatus = useCallback(async (soloId: string): Promise<SoloStatusResponse> => {
    const baseUrl = getApiUrl();
    const headers: Record<string, string> = {};
    const sessionCookie = await AsyncStorage.getItem('solo_auth_session');
    if (sessionCookie) {
      headers['X-Session-Token'] = sessionCookie;
      if (Platform.OS !== 'web') {
        headers['Cookie'] = sessionCookie;
      }
    }

    const url = new URL(`/api/solos/${soloId}/status`, baseUrl).toString();
    const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
    const res = await fetchFn(url, { headers, credentials: 'include' } as any);
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status}`);
    }
    return await res.json() as SoloStatusResponse;
  }, []);

  const retrySoloFn = useCallback(async (soloId: string): Promise<string> => {
    const baseUrl = getApiUrl();
    const headers: Record<string, string> = {};
    const sessionCookie = await AsyncStorage.getItem('solo_auth_session');
    if (sessionCookie) {
      headers['X-Session-Token'] = sessionCookie;
      if (Platform.OS !== 'web') {
        headers['Cookie'] = sessionCookie;
      }
    }

    const url = new URL(`/api/solos/${soloId}/retry`, baseUrl).toString();
    const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
    const res = await fetchFn(url, { method: 'POST', headers, credentials: 'include' } as any);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Retry failed: ${errorText}`);
    }
    const data = await res.json();
    return data.id as string;
  }, []);

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

  const searchUsers = useCallback((_query: string) => {
    return [] as UserProfile[];
  }, []);

  const refreshFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [solosQueryKey] });
  }, [queryClient, solosQueryKey]);

  const value = useMemo(() => ({
    currentUser,
    updateProfile,
    posts,
    addPost,
    uploadAndPost,
    pollSoloStatus,
    retrySolo: retrySoloFn,
    toggleLike,
    addComment,
    following,
    toggleFollow,
    searchPosts,
    searchUsers,
    allUsers: [] as UserProfile[],
    isUploading,
    refreshFeed,
    feedTag,
    setFeedTag,
  }), [currentUser, updateProfile, posts, addPost, uploadAndPost, pollSoloStatus, retrySoloFn, toggleLike, addComment, following, toggleFollow, searchPosts, searchUsers, isUploading, refreshFeed, feedTag]);

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
