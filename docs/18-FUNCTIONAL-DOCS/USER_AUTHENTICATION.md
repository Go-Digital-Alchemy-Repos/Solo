# User Authentication

## Overview

Solo uses session-based authentication with email/password credentials. Authentication state is managed by the `AuthProvider` context on the frontend and `express-session` on the backend.

## Signup Flow

1. User enters email and password on the auth screen
2. Frontend sends POST to `/api/auth/signup`
3. Backend validates input, hashes password with bcrypt (12 rounds)
4. New user record is created in the database
5. Session is created and cookie returned
6. Frontend stores session cookie in AsyncStorage (mobile) or browser cookies (web)
7. User is redirected to profile setup (username is required)

## Login Flow

1. User enters email and password
2. Frontend sends POST to `/api/auth/login`
3. Backend verifies credentials against stored hash
4. Session is created and cookie returned
5. Frontend persists session and navigates to app

## Session Persistence

- Sessions are stored in PostgreSQL via `connect-pg-simple`
- 30-day expiry with rolling renewal
- Mobile clients attach session cookie via `x-session-token` header
- `AuthProvider` checks `/api/auth/me` on app load to restore session

## Profile Setup Gate

After signup, users must complete profile setup:
- Set a unique username (3-20 chars, lowercase, alphanumeric + underscores)
- Optionally set bio and avatar
- `AuthGate` component prevents access to main app until username is set
