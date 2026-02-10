import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-context';
import { authFetch } from './auth-fetch';
import { getApiUrl } from './query-client';
import { getSessionCookie } from './secure-session';

export interface DmUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio?: string;
}

export interface DmConversation {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isMuted: boolean;
  participants: DmUser[];
  otherUser: DmUser | null;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  text: string | null;
  mediaUrl: string | null;
  mediaMeta: any;
  clientNonce: string | null;
  createdAt: string;
  editedAt: string | null;
  sender: { username: string; avatarUrl: string | null };
  _optimistic?: boolean;
  _failed?: boolean;
}

interface TypingState {
  [conversationId: string]: { [userId: string]: boolean };
}

interface PresenceState {
  [userId: string]: { status: string; lastSeenAt: string };
}

interface DmContextValue {
  conversations: DmConversation[];
  loadingConversations: boolean;
  refreshConversations: () => Promise<void>;
  messages: DmMessage[];
  loadingMessages: boolean;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  sendMessage: (text: string, clientNonce: string) => Promise<void>;
  markAsRead: (messageId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  startConversation: (userId: string) => Promise<string>;
  searchUsers: (query: string) => Promise<DmUser[]>;
  typing: TypingState;
  sendTyping: (isTyping: boolean) => void;
  presence: PresenceState;
  totalUnread: number;
  socketConnected: boolean;
}

const DmContext = createContext<DmContextValue | null>(null);

export function DmProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [typing, setTyping] = useState<TypingState>({});
  const [presence, setPresence] = useState<PresenceState>({});
  const [socketConnected, setSocketConnected] = useState(false);
  const activeConvRef = useRef<string | null>(null);

  const connectSocket = useCallback(async () => {
    if (socketRef.current?.connected) return;
    if (!isAuthenticated) return;

    const baseUrl = getApiUrl();
    const cookie = await getSessionCookie();

    const socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      extraHeaders: cookie ? { Cookie: cookie } : {},
      path: '/socket.io',
      autoConnect: true,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('dm:message_created', (data: { conversationId: string; message: DmMessage }) => {
      if (activeConvRef.current === data.conversationId) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) => m.id === data.message.id || (m.clientNonce && m.clientNonce === data.message.clientNonce)
          );
          if (exists) {
            return prev.map((m) =>
              (m.clientNonce && m.clientNonce === data.message.clientNonce) ? { ...data.message, _optimistic: false } : m
            );
          }
          return [data.message, ...prev];
        });
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessageAt: data.message.createdAt,
                lastMessagePreview: data.message.text?.slice(0, 100) || 'Sent a message',
                unreadCount: activeConvRef.current === data.conversationId ? c.unreadCount : c.unreadCount + 1,
              }
            : c
        ).sort((a, b) => {
          const aTime = a.lastMessageAt || a.createdAt;
          const bTime = b.lastMessageAt || b.createdAt;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        })
      );
    });

    socket.on('dm:conversation_updated', (data: { conversationId: string; lastMessageAt: string; lastMessagePreview: string }) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === data.conversationId);
        if (!exists) {
          refreshConversations();
          return prev;
        }
        return prev.map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessageAt: data.lastMessageAt,
                lastMessagePreview: data.lastMessagePreview,
                unreadCount: activeConvRef.current === data.conversationId ? c.unreadCount : c.unreadCount + 1,
              }
            : c
        ).sort((a, b) => {
          const aTime = a.lastMessageAt || a.createdAt;
          const bTime = b.lastMessageAt || b.createdAt;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
      });
    });

    socket.on('dm:typing', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      setTyping((prev) => ({
        ...prev,
        [data.conversationId]: {
          ...(prev[data.conversationId] || {}),
          [data.userId]: data.isTyping,
        },
      }));
      if (data.isTyping) {
        setTimeout(() => {
          setTyping((prev) => ({
            ...prev,
            [data.conversationId]: {
              ...(prev[data.conversationId] || {}),
              [data.userId]: false,
            },
          }));
        }, 5000);
      }
    });

    socket.on('dm:read_receipt', (data: { conversationId: string; userId: string; messageId: string }) => {
    });

    socket.on('dm:presence', (data: { userId: string; status: string; lastSeenAt: string }) => {
      setPresence((prev) => ({
        ...prev,
        [data.userId]: { status: data.status, lastSeenAt: data.lastSeenAt },
      }));
    });

    socketRef.current = socket;
  }, [isAuthenticated]);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    return () => disconnectSocket();
  }, [isAuthenticated]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        if (!socketRef.current?.connected) {
          connectSocket();
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, connectSocket]);

  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await authFetch('/api/dm/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.data || []);
      }
    } catch (err) {
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshConversations();
    }
  }, [isAuthenticated]);

  const setActiveConversation = useCallback(async (id: string | null) => {
    activeConvRef.current = id;
    setActiveConversationIdState(id);

    if (id) {
      if (socketRef.current?.connected) {
        if (activeConvRef.current) {
          socketRef.current.emit('dm:leave_conversation', { conversationId: activeConvRef.current });
        }
        socketRef.current.emit('dm:join_conversation', { conversationId: id });
      }

      setMessages([]);
      setMessageCursor(null);
      setHasMoreMessages(false);
      setLoadingMessages(true);

      try {
        const res = await authFetch(`/api/dm/conversations/${id}/messages?limit=30`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.data.messages || []);
          setHasMoreMessages(data.data.hasMore || false);
          setMessageCursor(data.data.nextCursor || null);
        }
      } catch {
      } finally {
        setLoadingMessages(false);
      }
    } else {
      setMessages([]);
      setMessageCursor(null);
      setHasMoreMessages(false);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!activeConvRef.current || !messageCursor || loadingMessages) return;

    setLoadingMessages(true);
    try {
      const res = await authFetch(
        `/api/dm/conversations/${activeConvRef.current}/messages?cursor=${encodeURIComponent(messageCursor)}&limit=30`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, ...(data.data.messages || [])]);
        setHasMoreMessages(data.data.hasMore || false);
        setMessageCursor(data.data.nextCursor || null);
      }
    } catch {
    } finally {
      setLoadingMessages(false);
    }
  }, [messageCursor, loadingMessages]);

  const sendMessage = useCallback(async (text: string, clientNonce: string) => {
    if (!activeConvRef.current || !user) return;
    const convId = activeConvRef.current;

    const optimisticMsg: DmMessage = {
      id: clientNonce,
      conversationId: convId,
      senderId: user.id,
      type: 'text',
      text,
      mediaUrl: null,
      mediaMeta: null,
      clientNonce,
      createdAt: new Date().toISOString(),
      editedAt: null,
      sender: { username: user.username || 'You', avatarUrl: user.avatarUrl },
      _optimistic: true,
    };

    setMessages((prev) => [optimisticMsg, ...prev]);

    if (socketRef.current?.connected) {
      socketRef.current.emit('dm:send_message', {
        conversationId: convId,
        type: 'text',
        text,
        clientNonce,
      }, (response: any) => {
        if (response?.ok && response.message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientNonce === clientNonce ? { ...response.message, _optimistic: false } : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientNonce === clientNonce ? { ...m, _failed: true, _optimistic: false } : m
            )
          );
        }
      });
    } else {
      try {
        const res = await authFetch(`/api/dm/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', text, clientNonce }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.map((m) =>
              m.clientNonce === clientNonce ? { ...data.data, _optimistic: false } : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientNonce === clientNonce ? { ...m, _failed: true, _optimistic: false } : m
            )
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientNonce === clientNonce ? { ...m, _failed: true, _optimistic: false } : m
          )
        );
      }
    }
  }, [user]);

  const markAsRead = useCallback((messageId: string) => {
    if (!activeConvRef.current) return;
    const convId = activeConvRef.current;

    if (socketRef.current?.connected) {
      socketRef.current.emit('dm:mark_read', { conversationId: convId, messageId });
    } else {
      authFetch(`/api/dm/messages/${messageId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      }).catch(() => {});
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      const res = await authFetch(`/api/dm/messages/${messageId}/delete`, {
        method: 'POST',
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch {}
  }, []);

  const startConversation = useCallback(async (targetUserId: string): Promise<string> => {
    const res = await authFetch('/api/dm/conversations/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId }),
    });
    if (!res.ok) throw new Error('Failed to start conversation');
    const data = await res.json();
    if (data.data.created) {
      refreshConversations();
    }
    return data.data.conversationId;
  }, [refreshConversations]);

  const searchUsersApi = useCallback(async (query: string): Promise<DmUser[]> => {
    if (!query || query.length < 2) return [];
    try {
      const res = await authFetch(`/api/dm/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        return (data.data || []).map((u: any) => ({
          userId: u.id,
          username: u.username || u.email,
          avatarUrl: u.avatarUrl || null,
          bio: u.bio || '',
        }));
      }
    } catch {}
    return [];
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!activeConvRef.current || !socketRef.current?.connected) return;
    socketRef.current.emit('dm:typing', {
      conversationId: activeConvRef.current,
      isTyping,
    });
  }, []);

  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [conversations]);

  const value = useMemo(() => ({
    conversations,
    loadingConversations,
    refreshConversations,
    messages,
    loadingMessages,
    loadMoreMessages,
    hasMoreMessages,
    activeConversationId,
    setActiveConversation,
    sendMessage,
    markAsRead,
    deleteMessage,
    startConversation,
    searchUsers: searchUsersApi,
    typing,
    sendTyping,
    presence,
    totalUnread,
    socketConnected,
  }), [
    conversations, loadingConversations, messages, loadingMessages,
    hasMoreMessages, activeConversationId, typing, presence, totalUnread, socketConnected,
    refreshConversations, loadMoreMessages, sendMessage, markAsRead,
    deleteMessage, startConversation, searchUsersApi, sendTyping, setActiveConversation,
  ]);

  return (
    <DmContext.Provider value={value}>
      {children}
    </DmContext.Provider>
  );
}

export function useDm() {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error('useDm must be used within DmProvider');
  return ctx;
}
