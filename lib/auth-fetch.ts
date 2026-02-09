import { Platform } from 'react-native';
import { getApiUrl } from './query-client';
import { getSessionCookie, setSessionCookie } from './secure-session';

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl).toString();

  const sessionCookie = await getSessionCookie();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
    headers['X-Session-Token'] = sessionCookie;
  }

  const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
  return fetchFn(url, {
    ...options,
    headers,
    credentials: 'include' as RequestCredentials,
  } as any);
}

export async function saveSessionFromResponse(data: any) {
  if (data?.sessionCookie) {
    await setSessionCookie(data.sessionCookie);
  } else {
    const setCookie = data?.headers?.get?.('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/connect\.sid=[^;]+/);
      if (match) {
        await setSessionCookie(match[0]);
      }
    }
  }
}

export function extractErrorMessage(data: any, fallback: string): string {
  if (data?.error?.message) return data.error.message;
  if (typeof data?.error === 'string') return data.error;
  return fallback;
}
