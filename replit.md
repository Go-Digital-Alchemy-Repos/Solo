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
- **Data Persistence**: Session cookie stored in `expo-secure-store` (encrypted, iOS/Android) with `AsyncStorage` fallback (web). Likes and follows stored locally in `AsyncStorage`. Posts fetched from server via React Query
- **Auth Helpers**: Shared `authFetch` in `lib/auth-fetch.ts` handles cookie attachment for all authenticated requests. `lib/secure-session.ts` manages secure cookie storage with automatic migration from legacy AsyncStorage
- **Audio**: `expo-av` handles both recording (on the Record tab) and playback. The `PlaybackProvider` manages a single shared audio instance with play/pause/seek/resume controls and position tracking
- **Creator Suite** (Record tab): Multi-segment recording (pause/resume), optional Teleprompter overlay with auto-scroll, Background Vibes selector (Coffee Shop/Nature/Lofi Beat at 10% volume mixed server-side via ffmpeg), WaveformTrimmer with transcript preview bubble, Redo button. Components: `Teleprompter.tsx`, `VibeSelector.tsx`
  - Teleprompter speed calibrated to 160 WPM baseline (1.0x) with multiplier chips: 0.5x, 1.0x, 1.2x, 1.5x, 2.0x
  - Edit screen has Cancel/Post header, inline title input, scrubbing (tap/drag waveform to seek), clearly visible Preview/Play button, and direct posting flow
  - Post triggers async processing pipeline: upload returns solo ID immediately, client polls `GET /api/solos/:id/status` every 1.5s showing step-by-step progress (uploading → trimming → mixing → transcribing → done). Processing happens in `server/processing/soloProcessor.ts` with state machine (queued → processing → ready/failed)
  - Failed processing shows retry button (`POST /api/solos/:id/retry`) and discard option. Max 3 attempts tracked in `attempts` column
  - After successful processing, app navigates to Feed tab so user sees their new Solo immediately
  - Server-side trimming uses ffmpeg with -ss (start) and -t (duration) flags based on trimStartMs/trimEndMs from the client
  - Audio mixing: voice at 100% volume, vibe background at 10% volume with amix weights ensuring voice clarity
- **Animations**: `react-native-reanimated` powers waveform bar animations, like button effects, and recording visualizations
- **Fonts**: DM Sans (400, 500, 600, 700) loaded via `@expo-google-fonts/dm-sans`
- **UI Style**: Dark theme (black `#000000` background, gold `#FFD700` accent). Constants defined in `constants/colors.ts`
- **Platform Support**: iOS, Android, and Web. Platform-specific code handles safe areas, haptics (disabled on web), and keyboard behavior

### Backend (Express.js) — Feature-Based Modular Architecture
- **Server**: Express 5 running on Node.js (`server/index.ts`)
- **Architecture**: Feature-based modules with layered design (routes → controllers → services)
  - `server/features/auth/` — Authentication (signup, login, logout, profile, avatar serving)
  - `server/features/solos/` — Audio posts (CRUD, upload, trim, mix vibes, transcribe, stream)
  - `server/features/vibes/` — Background audio vibes (list, stream)
  - `server/features/admin/` — Admin portal API (stats, user management, docs management)
- **Shared Utilities**:
  - `server/middleware/errorHandler.ts` — Centralized async error handler & wrapper
  - `server/utils/auth-helpers.ts` — `requireAuth`, `requireAdmin`, `getSessionCookie` helpers
  - `server/utils/paths.ts` — Centralized file path constants (UPLOADS_DIR, AVATARS_DIR, VIBES_DIR, DOCS_DIR)
  - `server/utils/routeScanner.ts` — Auto-scans feature route files for API documentation generation
- **Route Mounting** (in `server/routes.ts`):
  - `/api/auth/*` → auth feature routes
  - `/api/solos/*` → solos feature routes
  - `/api/vibes/*` → vibes feature routes
  - `/api/admin/*` → admin feature routes
  - `/api/audio/:fileId` → audio streaming (from solos controller)
  - `/api/avatars/:fileName` → avatar serving (from auth controller)
- **API Endpoints**:
  - `POST /api/auth/signup` — Create account with email/password (bcrypt hashing, salt rounds 12)
  - `POST /api/auth/login` — Sign in with email/password
  - `POST /api/auth/logout` — Destroy session
  - `GET /api/auth/me` — Get current authenticated user
  - `PUT /api/auth/profile` — Update username, bio, avatar (multipart form with multer)
  - `POST /api/solos` — Upload audio recording (requires auth). Returns solo ID immediately, triggers async processing (trim → mix → transcribe). Accepts optional `trimStartMs`/`trimEndMs` form fields
  - `GET /api/solos` — List all recordings (only status='ready' shown in feed)
  - `GET /api/solos/:soloId/status` — Poll processing status (status, processingStep, processingError, attempts)
  - `POST /api/solos/:soloId/retry` — Retry failed processing (max 3 attempts)
  - `DELETE /api/solos/:soloId` — Delete a solo (owner only)
  - `PUT /api/solos/:soloId` — Update solo title/tags (owner only)
  - `GET /api/solos/user/:userId` — Get user's solos
  - `POST /api/solos/:soloId/transcribe` — Generate word-level transcript using OpenAI gpt-4o-mini-transcribe
  - `GET /api/audio/:fileId` — Stream audio file with byte-range support
  - `GET /api/vibes` — List available background vibes
  - `GET /api/vibes/:vibeId/audio` — Stream vibe audio
- **BetterAuth Integration**: BetterAuth runs alongside existing auth at `/api/better-auth/*`. Config in `server/auth.ts`. Uses Drizzle adapter with dedicated tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`). Admin plugin provides role-based access control (roles: `user`, `admin`). Middleware in `server/middleware/auth.ts` (session validation checking both legacy and BetterAuth sessions) and `server/middleware/requireRole.ts` (role guard). BetterAuth endpoints: sign-up at `/api/better-auth/sign-up/email`, sign-in at `/api/better-auth/sign-in/email`, sign-out at `/api/better-auth/sign-out`, health at `/api/better-auth/ok`
- **Session Management (Legacy)**: `express-session` with `connect-pg-simple` for PostgreSQL-backed sessions. 30-day session expiry, httpOnly cookies, secure in production. Still used by mobile app login flows
- **File Uploads**: `multer` for avatar and audio file uploads, stored in `uploads/avatars/` and `uploads/solos/`
- **CORS**: Dynamic CORS configuration supporting Replit dev/deployment domains and localhost origins
- **Static Serving**: In production, serves the Expo web build from a `dist/` directory. In development, proxies to the Expo Metro bundler
- **Admin Portal**: Web-based admin panel served at `/admin` (HTML in `server/templates/admin.html`). Routes defined in `server/features/admin/admin.routes.ts`. Features: Reports dashboard (stats, trends, top contributors), App Users management (search, paginate, edit, delete), App Docs management (filesystem-based docs scanning with coverage tracking), System Integrations management (MailGun email, Cloudflare R2 storage, Twilio SMS, Stripe payments — config forms, connection testing, enable/disable toggles). Uses same session-based auth with `is_admin` flag on users table
  - System Integrations: Configs stored in `system_integrations` table with masked secrets. Service in `server/features/admin/integrations.service.ts`. API: `GET /api/admin/integrations`, `PUT /api/admin/integrations`, `POST /api/admin/integrations/:service/test`

### Database Schema (Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts`
  - `users` table: `id` (UUID), `email` (unique), `password_hash`, `username` (unique, nullable), `avatar_url`, `bio`, `is_admin` (boolean, default false), `role` (text, default 'user'), `created_at`
  - `ba_user` table: BetterAuth user store - `id`, `name`, `email`, `email_verified`, `image`, `role`, `banned`, `ban_reason`, `ban_expires`, `created_at`, `updated_at`
  - `ba_session` table: BetterAuth session store - `id`, `expires_at`, `token`, `ip_address`, `user_agent`, `user_id` (FK to ba_user)
  - `ba_account` table: BetterAuth account/credentials store - `id`, `account_id`, `provider_id`, `user_id` (FK to ba_user), `password`, etc.
  - `ba_verification` table: BetterAuth verification tokens - `id`, `identifier`, `value`, `expires_at`
  - `solos` table: `id` (UUID), `user_id`, `username`, `audio_url`, `timestamp`, `tags` (text array), `avatar_url`, `title`, `duration_ms`, `display_name`, `transcript` (JSONB, nullable), `status` (text: queued/processing/ready/failed, default 'ready'), `processing_step` (text, nullable), `processing_error` (text, nullable), `attempts` (integer, default 0), `ready_at` (timestamp, nullable)
  - `app_docs` table: `id` (serial), `title`, `content`, `category`, `sort_order` (integer, default 0), `created_at`, `updated_at`
  - `system_integrations` table: `id` (serial), `service_name` (varchar, unique), `config` (JSONB), `enabled` (boolean), `last_test_result` (text, nullable), `created_at`, `updated_at`
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
