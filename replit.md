# Solo - Audio Social Platform

## Overview

Solo is an audio-focused social media application built with Expo (React Native) and an Express.js backend. Users can record audio posts, share them in a feed, discover other users and sounds, and interact through likes, comments, and follows. The app features a dark theme with gold accent colors, animated waveform visualizations, and audio playback controls. It includes full user authentication with email/password signup, login, session persistence, and a mandatory profile setup flow. It also includes a web-based admin portal at `/admin` for app administration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`)
- **Routing**: File-based routing via `expo-router` with typed routes. The app uses a tab-based navigation layout with 4 tabs: Feed, Search, Record, and Profile
- **Authentication Flow**: `AuthProvider` (in `lib/auth-context.tsx`) manages auth state. `AuthGate` component in `_layout.tsx` handles routing: unauthenticated users -> `/welcome`, authenticated without username -> `/profile-setup`, fully set up -> `/(tabs)`
- **State Management**: React Context API for auth (`AuthProvider`), app data (`DataProvider` in `lib/data-context.tsx`), and audio playback (`PlaybackProvider` in `lib/playback-provider.tsx`). TanStack React Query for server data fetching
- **Data Persistence**: Session cookie stored in `AsyncStorage` for auth persistence. Likes and follows stored locally in `AsyncStorage`. Posts fetched from server via React Query
- **Audio**: `expo-av` handles both recording (on the Record tab) and playback. The `PlaybackProvider` manages a single shared audio instance with play/pause/seek/resume controls and position tracking
- **Creator Suite** (Record tab): Multi-segment recording (pause/resume), optional Teleprompter overlay with auto-scroll, Background Vibes selector (Coffee Shop/Nature/Lofi Beat at 10% volume mixed server-side via ffmpeg), WaveformTrimmer with transcript preview bubble, Redo button. Components: `Teleprompter.tsx`, `VibeSelector.tsx`
  - Teleprompter speed calibrated to 160 WPM baseline (1.0x) with multiplier chips: 0.5x, 1.0x, 1.2x, 1.5x, 2.0x
  - Edit screen has Cancel/Post header, inline title input, scrubbing (tap/drag waveform to seek), clearly visible Preview/Play button, and direct posting flow
  - Post triggers a processing screen with pulsing gold animation while audio is trimmed server-side via ffmpeg, mixed with vibes, uploaded, and transcribed
  - After successful post, app navigates to Feed tab so user sees their new Solo immediately
  - Server-side trimming uses ffmpeg with -ss (start) and -t (duration) flags based on trimStartMs/trimEndMs from the client
  - Audio mixing: voice at 100% volume, vibe background at 10% volume with amix weights ensuring voice clarity
- **Animations**: `react-native-reanimated` powers waveform bar animations, like button effects, and recording visualizations
- **Fonts**: DM Sans (400, 500, 600, 700) loaded via `@expo-google-fonts/dm-sans`
- **UI Style**: Dark theme (black `#000000` background, gold `#FFD700` accent). Constants defined in `constants/colors.ts`
- **Platform Support**: iOS, Android, and Web. Platform-specific code handles safe areas, haptics (disabled on web), and keyboard behavior

### Backend (Express.js)
- **Server**: Express 5 running on Node.js (`server/index.ts`)
- **Routes**: Registered in `server/routes.ts`, prefixed with `/api`
  - `POST /api/auth/signup` — Create account with email/password (bcrypt hashing, salt rounds 12)
  - `POST /api/auth/login` — Sign in with email/password
  - `POST /api/auth/logout` — Destroy session
  - `GET /api/auth/me` — Get current authenticated user
  - `PUT /api/auth/profile` — Update username, bio, avatar (multipart form with multer)
  - `POST /api/solos` — Upload audio recording (requires auth). Accepts optional `trimStartMs`/`trimEndMs` form fields for server-side audio trimming via ffmpeg
  - `GET /api/solos` — List all recordings
  - `GET /api/audio/:filename` — Stream audio file with byte-range support
  - `POST /api/solos/:soloId/transcribe` — Generate word-level transcript using OpenAI gpt-4o-mini-transcribe
- **Session Management**: `express-session` with `connect-pg-simple` for PostgreSQL-backed sessions. 30-day session expiry, httpOnly cookies, secure in production
- **File Uploads**: `multer` for avatar and audio file uploads, stored in `uploads/avatars/` and `uploads/audio/`
- **CORS**: Dynamic CORS configuration supporting Replit dev/deployment domains and localhost origins
- **Static Serving**: In production, serves the Expo web build from a `dist/` directory. In development, proxies to the Expo Metro bundler
- **Admin Portal**: Web-based admin panel served at `/admin` (HTML in `server/templates/admin.html`). Routes defined in `server/admin-routes.ts` with `requireAdmin` middleware. Features: Reports dashboard (stats, trends, top contributors), App Users management (search, paginate, edit, delete), App Docs management (CRUD for documentation). Uses same session-based auth with `is_admin` flag on users table

### Database Schema (Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts`
  - `users` table: `id` (UUID), `email` (unique), `password_hash`, `username` (unique, nullable), `avatar_url`, `bio`, `is_admin` (boolean, default false), `created_at`
  - `solos` table: `id` (UUID), `user_id`, `username`, `audio_url`, `timestamp`, `tags` (text array), `avatar_url`, `title`, `duration_ms`, `display_name`, `transcript` (JSONB, nullable)
  - `app_docs` table: `id` (serial), `title`, `content`, `category`, `sort_order` (integer, default 0), `created_at`, `updated_at`
  - `session` table: managed by connect-pg-simple (not in Drizzle schema)
- **Validation**: `drizzle-zod` generates Zod schemas from the Drizzle table definitions
- **Migrations**: Managed via `drizzle-kit push` (use `--force` to avoid session table conflicts)
- **Connection**: Requires `DATABASE_URL` environment variable for PostgreSQL

### Key Design Decisions

1. **Session-based auth with cookie persistence**: Uses express-session stored in PostgreSQL. On mobile, the session cookie (`connect.sid`) is saved in AsyncStorage and sent as a Cookie header. On web, browser cookies handle it natively.

2. **Profile setup as mandatory gate**: After signup, users must set a username (3-20 chars, lowercase, letters/numbers/underscores) before accessing the main app. This ensures all posts have proper attribution.

3. **Hybrid local/server data**: Posts are fetched from the server, but likes, comments, and follows are stored locally in AsyncStorage. This is a stepping stone toward full server-backed social features.

4. **Shared schema directory**: The `shared/` directory contains code shared between frontend and backend (currently just the DB schema). Path alias `@shared/*` is configured in tsconfig.

5. **Single audio instance pattern**: The PlaybackProvider maintains one `Audio.Sound` ref at a time, cleaning up before loading new audio. It tracks saved positions per post for resume functionality.

6. **Expo Router file-based routing**: Pages live in `app/` directory. Auth screens (`welcome.tsx`, `auth.tsx`, `profile-setup.tsx`) are at the root level. The `(tabs)` group creates the tab navigator.

## External Dependencies

- **Database**: PostgreSQL (configured via `DATABASE_URL` environment variable, used with Drizzle ORM)
- **Expo Services**: Expo SDK for native APIs (camera, image picker, audio, haptics, location, crypto)
- **Fonts**: Google Fonts (DM Sans) loaded via Expo font packages
- **Key npm packages**:
  - `@tanstack/react-query` — Server state management
  - `drizzle-orm` / `drizzle-kit` — Database ORM and migration tooling
  - `expo-av` — Audio recording and playback
  - `expo-image-picker` — Profile photo selection
  - `react-native-reanimated` — Smooth animations
  - `react-native-gesture-handler` — Touch gesture handling
  - `react-native-keyboard-controller` — Keyboard-aware scrolling
  - `express-session` / `connect-pg-simple` — Session management
  - `bcrypt` — Password hashing
  - `multer` — File upload handling
  - `patch-package` — Applied via postinstall for any patched dependencies
