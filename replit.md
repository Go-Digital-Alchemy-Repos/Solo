# Solo - Audio Social Platform

## Overview
Solo is an audio-focused social media application built with Expo (React Native) and an Express.js backend. It enables users to record, share, and discover audio posts, interact through likes, comments, and follows, and manage their profiles. The platform also includes a web-based admin portal for comprehensive application management. The project aims to create an engaging audio-centric social experience with a distinct dark theme and gold accents.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, utilizing the new architecture.
- **Routing**: File-based routing with `expo-router` and typed routes, organized into a tab-based navigation (Feed, Search, Record, Profile).
- **Authentication**: Managed by `AuthProvider` with `AuthGate` enforcing a mandatory profile setup flow post-signup.
- **State Management**: React Context API for core states (auth, app data, audio playback) and TanStack React Query for server data fetching.
- **Data Persistence**: Session cookies secured with `expo-secure-store` (with `AsyncStorage` fallback for web). Local storage for likes and follows.
- **Audio**: `expo-av` for recording and playback, managed by a `PlaybackProvider` for a single shared audio instance.
- **Creator Suite**: Features multi-segment recording, an optional Teleprompter, a "Background Vibes" selector, and a WaveformTrimmer with transcript preview. Post-processing is asynchronous, with client-side polling for status updates and error handling.
- **Animations**: `react-native-reanimated` for dynamic UI elements.
- **Design System**: Dark theme (black with gold accents) implemented with centralized design tokens (`Spacing`, `Radius`, `FontSize`, `FontFamily`, `Shadows`) and reusable UI primitives for consistent styling.
- **Platform Support**: Supports iOS, Android, and Web, with platform-specific adjustments for safe areas, haptics, and keyboard behavior.

### Backend (Express.js)
- **Server**: Express 5 on Node.js, structured with feature-based modules (auth, solos, vibes, admin).
- **Shared Utilities**: Includes centralized error handling, authentication helpers, and file path constants.
- **API Endpoints**: Comprehensive set of RESTful APIs for authentication, solo (audio post) management (CRUD, upload, processing status, retry), background vibes listing, and admin functionalities.
- **Authentication**: Integrates with BetterAuth for enhanced authentication alongside legacy session management (`express-session` with PostgreSQL-backed sessions).
- **File Uploads**: `multer` handles uploads for avatars and audio files.
- **CORS**: Dynamically configured to support development and deployment environments.
- **Static Serving**: Serves the Expo web build in production; proxies to Metro bundler in development.
- **Admin Portal**: A web-based interface at `/admin` for reports, user management, documentation management, system integrations, processing job debugging, and client error reporting.
- **Logging & Tracing**: Structured logging with request IDs for correlation and client telemetry for error reporting.

### Database Schema (Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**:
    - `users`: Stores user details, including `is_admin` and `role`.
    - `ba_user`, `ba_session`, `ba_account`, `ba_verification`: Tables for BetterAuth integration.
    - `solos`: Stores audio post metadata, including processing status, transcript, and error information.
    - `app_docs`: Manages application documentation.
    - `system_integrations`: Stores configurations for external services.
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