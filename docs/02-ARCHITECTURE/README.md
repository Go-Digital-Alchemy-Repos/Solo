# Architecture Overview

Solo follows a client-server architecture with an Expo React Native frontend and an Express.js backend.

## System Layers

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54, React Native 0.81
- **Routing**: File-based routing via `expo-router`
- **State**: React Context (auth, data, playback) + TanStack React Query
- **Audio**: `expo-av` for recording and playback
- **Animations**: `react-native-reanimated`

### Backend (Express.js)
- **Server**: Express 5 with TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Sessions**: `express-session` with `connect-pg-simple`
- **File Storage**: Local filesystem (`uploads/` directory)
- **Audio Processing**: ffmpeg for trimming and mixing

### Database (PostgreSQL)
- **ORM**: Drizzle ORM with `drizzle-kit` for schema management
- **Tables**: `users`, `solos`, `app_docs`, `session`
- **Schema**: Defined in `shared/schema.ts`

## Data Flow

1. User records audio on the Record tab
2. Audio is uploaded to the server via multipart form
3. Server trims/mixes audio with ffmpeg if needed
4. Audio file is saved to `uploads/solos/`
5. Solo record is created in the database
6. Background transcription is triggered via OpenAI
7. Feed displays solos fetched via React Query

## Authentication Flow

1. User signs up/logs in via email+password
2. Server creates a session stored in PostgreSQL
3. Session cookie (`connect.sid`) is persisted in AsyncStorage on mobile
4. `AuthGate` component routes users based on auth state
5. Profile setup is mandatory before accessing the main app
