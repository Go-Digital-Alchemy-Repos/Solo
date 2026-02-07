# Solo - Audio Social Platform

## Overview

Solo is an audio-focused social media application built with Expo (React Native) and an Express.js backend. Users can record audio posts, share them in a feed, discover other users and sounds, and interact through likes, comments, and follows. The app features a dark theme with gold accent colors, animated waveform visualizations, and audio playback controls.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`)
- **Routing**: File-based routing via `expo-router` with typed routes. The app uses a tab-based navigation layout with 4 tabs: Feed, Search, Record, and Profile
- **State Management**: React Context API for app data (`DataProvider` in `lib/data-context.tsx`) and audio playback state (`PlaybackProvider` in `lib/playback-provider.tsx`). TanStack React Query is available for server data fetching (`lib/query-client.ts`)
- **Data Persistence**: Currently uses `AsyncStorage` for local data and in-memory state via context. The data context manages posts, users, likes, comments, and follows locally
- **Audio**: `expo-av` handles both recording (on the Record tab) and playback. The `PlaybackProvider` manages a single shared audio instance with play/pause/seek/resume controls and position tracking
- **Animations**: `react-native-reanimated` powers waveform bar animations, like button effects, and recording visualizations
- **Fonts**: DM Sans (400, 500, 600, 700) loaded via `@expo-google-fonts/dm-sans`
- **UI Style**: Dark theme (black background, gold `#FFD700` accent). Constants defined in `constants/colors.ts`
- **Platform Support**: iOS, Android, and Web. Platform-specific code handles safe areas, haptics (disabled on web), and keyboard behavior

### Backend (Express.js)
- **Server**: Express 5 running on Node.js (`server/index.ts`)
- **Routes**: Registered in `server/routes.ts` — currently minimal, prefixed with `/api`
- **Storage**: `server/storage.ts` defines a `MemStorage` class implementing `IStorage` interface with basic user CRUD. This is an in-memory store meant to be replaced with database-backed storage
- **CORS**: Dynamic CORS configuration supporting Replit dev/deployment domains and localhost origins
- **Static Serving**: In production, serves the Expo web build from a `dist/` directory. In development, proxies to the Expo Metro bundler
- **Build**: Server is bundled with esbuild for production (`server:build` script)

### Database Schema (Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` — currently has a single `users` table with `id` (UUID), `username`, and `password` fields
- **Validation**: `drizzle-zod` generates Zod schemas from the Drizzle table definitions
- **Migrations**: Output to `./migrations` directory, managed via `drizzle-kit push`
- **Connection**: Requires `DATABASE_URL` environment variable for PostgreSQL

### Key Design Decisions

1. **Local-first data model**: The app currently stores posts, likes, comments, and follows in React Context with AsyncStorage persistence rather than the server database. The server schema only has users. This means the app works offline/locally but will need migration to server-backed storage for multi-user functionality.

2. **Shared schema directory**: The `shared/` directory contains code shared between frontend and backend (currently just the DB schema). Path alias `@shared/*` is configured in tsconfig.

3. **Single audio instance pattern**: The PlaybackProvider maintains one `Audio.Sound` ref at a time, cleaning up before loading new audio. It tracks saved positions per post for resume functionality.

4. **Expo Router file-based routing**: Pages live in `app/` directory. The `(tabs)` group creates the tab navigator. `+not-found.tsx` and `+native-intent.tsx` handle edge cases.

## External Dependencies

- **Database**: PostgreSQL (configured via `DATABASE_URL` environment variable, used with Drizzle ORM)
- **Expo Services**: Expo SDK for native APIs (camera, image picker, audio, haptics, location, crypto)
- **Fonts**: Google Fonts (DM Sans, Space Grotesk) loaded via Expo font packages
- **Key npm packages**:
  - `@tanstack/react-query` — Server state management (configured but lightly used)
  - `drizzle-orm` / `drizzle-kit` — Database ORM and migration tooling
  - `expo-av` — Audio recording and playback
  - `expo-image-picker` — Profile photo selection
  - `react-native-reanimated` — Smooth animations
  - `react-native-gesture-handler` — Touch gesture handling
  - `react-native-keyboard-controller` — Keyboard-aware scrolling
  - `patch-package` — Applied via postinstall for any patched dependencies