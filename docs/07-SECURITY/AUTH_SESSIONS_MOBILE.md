# Auth & Sessions on Mobile

This document explains how authentication and sessions work between the Solo mobile app and the Express backend, why specific decisions were made, and how to troubleshoot common issues.

## How Sessions Work

Solo uses **server-side sessions** stored in PostgreSQL via `connect-pg-simple`. When a user logs in, the server creates a session and sends a signed `connect.sid` cookie back to the client.

### Why Manual Cookie Handling?

On native iOS and Android, React Native's `fetch` does not always handle cookies like a browser does. In particular:

- **Expo Go** and some React Native networking layers don't persist cookies across requests automatically.
- The server returns the session cookie string in the login/signup response body (`sessionCookie` field).
- The client stores this cookie and manually attaches it to every request as both a `Cookie` header and an `X-Session-Token` header (fallback for edge cases).

### Where the Session Is Stored

| Platform | Storage | Why |
|----------|---------|-----|
| iOS / Android | `expo-secure-store` | Encrypted on-device storage. Data is protected by the OS keychain. |
| Web | `AsyncStorage` (localStorage fallback) | SecureStore is not available on web. Browser cookies also work via `credentials: 'include'`. |

On first launch after the migration from AsyncStorage to SecureStore, any existing session in AsyncStorage is automatically migrated to SecureStore and the AsyncStorage copy is removed.

## Server Cookie Settings

| Setting | Value | Reason |
|---------|-------|--------|
| `httpOnly` | `true` | Prevents JavaScript access to the cookie (XSS protection) |
| `secure` | `true` | Cookie only sent over HTTPS (Replit always uses HTTPS) |
| `sameSite` | `"none"` | Required for cross-origin requests from the mobile app |
| `maxAge` | 30 days | Session expiry |
| `rolling` | `true` | Active users get their session extended automatically |
| `path` | `"/"` | Cookie applies to all routes |

### Session Pruning

Expired sessions are pruned from the PostgreSQL `session` table every 15 minutes by `connect-pg-simple`.

## Auth Flow

### Startup (App Bootstrap)

1. App loads `AuthProvider`
2. `checkAuth()` calls `GET /api/auth/me` with the stored session cookie
3. If 200 — user data is set, app proceeds
4. If 401 — session cookie is cleared, user is sent to welcome screen

### Login / Signup

1. Client sends email + password to `POST /api/auth/login` (or `/signup`)
2. Server validates, creates session, returns user data + `sessionCookie` string
3. Client stores the cookie in SecureStore (or AsyncStorage on web)
4. User state is set in AuthProvider

### Logout

1. Client calls `POST /api/auth/logout`
2. Server destroys the session and clears the cookie
3. Client clears SecureStore/AsyncStorage
4. User state is set to null

### Auth Gating (app/_layout.tsx)

The `AuthGate` component in the root layout watches auth state and routes:

| State | Destination |
|-------|-------------|
| Loading | Stay on current screen |
| Not authenticated | `/welcome` |
| Authenticated, no username | `/profile-setup` |
| Authenticated, has username | `/(tabs)` |

## The `/api/auth/me` Endpoint

This endpoint is the canonical source of auth state. It returns:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "cooluser",
  "avatarUrl": "/api/avatars/abc.jpg",
  "bio": "Hello world",
  "isAdmin": false,
  "createdAt": "2026-01-15T..."
}
```

Returns 401 if not authenticated.

The endpoint supports both cookie-based auth and the `X-Session-Token` header fallback, handled by the `requireAuth` middleware.

## CORS Configuration

CORS is configured to allow:

- Replit dev domains (`REPLIT_DEV_DOMAIN`)
- Replit deployment domains (`REPLIT_DOMAINS`)
- Localhost origins (for local development)
- Audio streaming endpoints use permissive CORS (`*`) since they don't require auth

Credentials (`Access-Control-Allow-Credentials: true`) are only sent for recognized origins, not for `*`.

## Shared Auth Helpers (Client)

All authenticated requests should use the shared `authFetch` function from `lib/auth-fetch.ts`:

```typescript
import { authFetch } from '@/lib/auth-fetch';

const res = await authFetch('/api/some-endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});
```

This automatically:
- Loads the session cookie from SecureStore/AsyncStorage
- Attaches it as both `Cookie` and `X-Session-Token` headers
- Uses the correct fetch implementation per platform
- Sets `credentials: 'include'`

## Troubleshooting Checklist

### "I'm logged in but API calls return 401"

1. **Check session storage**: Is the cookie actually saved? On native, the secure store may fail silently if the device doesn't support it.
2. **Check cookie format**: The stored value should look like `connect.sid=s%3A<signed-value>`. If it's empty or malformed, clear and re-login.
3. **Check CORS**: If the request origin isn't in the allowed list, the server won't include credential headers. Check browser console for CORS errors.
4. **Check session expiry**: Sessions expire after 30 days. If the user hasn't been active, they'll need to re-login.

### "Login works on web but not on mobile"

1. **SecureStore availability**: Some older Android devices may not support SecureStore. The code falls back to AsyncStorage automatically.
2. **Cookie header**: On native, the `Cookie` header must be set manually. Verify `authFetch` is being used (not a raw `fetch`).
3. **X-Session-Token fallback**: The server's `requireAuth` also checks the `X-Session-Token` header as a fallback for cases where the Cookie header is stripped.

### "Session disappears after app restart"

1. Verify SecureStore data persists by checking if `getSessionCookie()` returns a value after restart.
2. Ensure the app calls `GET /api/auth/me` on startup (the AuthProvider does this in `checkAuth`).
3. Check server logs — if the session ID is valid but the session row was pruned from PostgreSQL, the user will get a 401.

### "Admin endpoints return 403"

- The user must have `is_admin = true` in the `users` table. The `/me` endpoint now includes `isAdmin` so you can check client-side.

### "CORS errors in browser console"

- Ensure the request origin matches one of: `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, or `localhost:*`.
- Audio streaming routes use permissive CORS and should not have issues.
- Preflight (`OPTIONS`) requests must return proper headers — the CORS middleware handles this.
