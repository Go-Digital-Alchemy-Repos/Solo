# Solo - Audio Social Platform

## Overview
Solo is an audio-focused social media application built with Expo (React Native) and an Express.js backend. It enables users to record, share, and discover audio posts, interact through likes, comments, and follows, and manage their profiles. The platform also includes a web-based admin portal for comprehensive application management. The project aims to create an engaging audio-centric social experience with a distinct dark theme and gold accents.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, utilizing the new architecture.
- **Routing**: File-based routing with `expo-router` and typed routes, organized into a tab-based navigation (Feed, Search, Record, Messages, Profile).
- **Authentication**: Managed by `AuthProvider` with `AuthGate` enforcing a mandatory profile setup flow post-signup.
- **State Management**: React Context API for core states (auth, app data, audio playback, direct messaging) and TanStack React Query for server data fetching.
- **Direct Messaging**: Full DM system with `DmProvider` context managing conversations, real-time polling, typing indicators, presence tracking, and unread counts. UI includes Inbox (conversation list), New Message (user search), and Chat Thread screens.
- **Data Persistence**: Session cookies secured with `expo-secure-store` (with `AsyncStorage` fallback for web). Local storage for likes and follows.
- **Audio**: `expo-av` for recording and playback, managed by a `PlaybackProvider` for a single shared audio instance.
- **Creator Suite**: Features multi-segment recording, an optional Teleprompter, a "Background Vibes" selector, and a WaveformTrimmer with transcript preview. Post-processing is asynchronous, with client-side polling for status updates and error handling.
- **Animations**: `react-native-reanimated` for dynamic UI elements.
- **Design System**: Dark theme (black with gold accents) implemented with centralized design tokens (`Spacing`, `Radius`, `FontSize`, `FontFamily`, `Shadows`) and reusable UI primitives for consistent styling.
- **Platform Support**: Supports iOS, Android, and Web, with platform-specific adjustments for safe areas, haptics, and keyboard behavior.

### Backend (Express.js)
- **Server**: Express 5 on Node.js, structured with feature-based modules (auth, solos, vibes, admin, dm, search).
- **Shared Utilities**: Includes centralized error handling, authentication helpers, and file path constants.
- **API Endpoints**: Comprehensive set of RESTful APIs for authentication, solo (audio post) management (CRUD, upload, processing status, retry), background vibes listing, admin functionalities, and direct messaging (conversations, messages, typing, presence, read receipts).
- **Direct Messaging**: Feature module at `server/features/dm/` with routes (`dm.routes.ts`), service layer (`dm.service.ts`), and schema (`dm.schema.ts`). Supports 1:1 conversations, message CRUD, typing indicators, online presence, read receipts, and unread counts via polling.
- **Authentication**: Integrates with BetterAuth for enhanced authentication alongside legacy session management (`express-session` with PostgreSQL-backed sessions).
- **File Uploads**: `multer` handles uploads for avatars and audio files.
- **CORS**: Dynamically configured to support development and deployment environments.
- **Static Serving**: Serves the Expo web build in production; proxies to Metro bundler in development.
- **Admin Portal**: A web-based interface at `/admin` for reports, user management, documentation management, system integrations, processing job debugging, client error reporting, and system health monitoring.
- **Logging & Tracing**: Structured logging with request IDs (X-Request-Id header) for correlation, client telemetry for error reporting, and persistent event/request logging to database.
- **System Monitoring**: Health checks (DB, sessions, storage, FFmpeg, transcription), event logging with redaction, request audit trail, and admin-controlled verbose logging.
- **Search**: Feature module at `server/features/search/` with full-text search (tsvector + GIN indexes) for solos and trigram similarity (pg_trgm) for users. Includes search indexing service that hooks into solo create/update/transcribe lifecycle. API routes: `/api/search/users`, `/api/search/solos`, `/api/search/suggestions`, `/api/search/trending`, `/api/search/backfill`.
- **Caching**: Redis-ready in-memory cache at `server/lib/cache.ts` with TTL-based expiration and rate limiting. Designed for easy Redis swap-in when needed.

### Database Schema (Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**:
    - `users`: Stores user details, including `is_admin` and `role`.
    - `ba_user`, `ba_session`, `ba_account`, `ba_verification`: Tables for BetterAuth integration.
    - `solos`: Stores audio post metadata, including processing status, transcript, error information, `searchText` (denormalized text for search), and `searchVector` (tsvector for full-text search with GIN index).
    - `app_docs`: Manages application documentation.
    - `system_integrations`: Stores configurations for external services.
    - `system_events`: Structured event log with level, source, redacted details, and resolution tracking.
    - `request_logs`: HTTP request audit trail for errors and verbose-mode logging.
    - `dm_conversations`: Direct message conversations with type (direct/group), timestamps.
    - `dm_participants`: Links users to conversations with roles, mute settings, read cursors.
    - `dm_messages`: Individual messages with text content, sender, type, client nonce for dedup.
    - `dm_typing`: Typing indicator state per user per conversation.
    - `dm_presence`: Online/offline presence tracking per user.
- **Validation**: Zod schemas generated from Drizzle definitions.
- **Migrations**: Managed via `drizzle-kit`.
- **Connection**: Configured via `DATABASE_URL` environment variable.

### Key Design Decisions
1.  **Session-based authentication**: Uses `express-session` and cookies for persistence across platforms.
2.  **Mandatory profile setup**: Ensures proper user attribution before full app access.
3.  **Hybrid local/server data**: Balances server-fetched content with local caching for social interactions.
4.  **Shared schema directory**: Centralizes database schema definitions for frontend and backend.
5.  **Single audio instance**: Optimizes audio playback and resume functionality.
6.  **Expo Router**: Leverages file-based routing for streamlined navigation.

## External Dependencies
- **Database**: PostgreSQL
- **Expo Services**: SDK for native functionalities (camera, image picker, audio, haptics, etc.)
- **Fonts**: Google Fonts (DM Sans)
- **Key npm packages**:
    - `@tanstack/react-query`
    - `drizzle-orm` / `drizzle-kit`
    - `expo-av`
    - `expo-image-picker`
    - `react-native-reanimated`
    - `react-native-gesture-handler`
    - `react-native-keyboard-controller`
    - `express-session` / `connect-pg-simple`
    - `bcrypt`
    - `multer`
    - `patch-package`