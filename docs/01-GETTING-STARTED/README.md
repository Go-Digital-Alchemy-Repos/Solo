# Getting Started

Solo is an audio-focused social media platform built with Expo (React Native) and Express.js. This guide will help you set up the development environment and understand the basics.

## Prerequisites

- Node.js 18+
- PostgreSQL database (provided by Replit)
- ffmpeg (for audio processing)

## Quick Start

1. Install dependencies: `npm install`
2. Set up environment variables (see [Environment Variables](./ENVIRONMENT_VARIABLES.md))
3. Push database schema: `npm run db:push`
4. Start the backend: `npm run server:dev`
5. Start the frontend: `npm run expo:dev`

## Project Structure

```
├── app/                  # Expo Router pages (frontend)
│   ├── (tabs)/           # Tab navigator screens
│   ├── _layout.tsx       # Root layout with providers
│   ├── welcome.tsx       # Welcome/landing screen
│   ├── auth.tsx          # Login/signup screen
│   └── profile-setup.tsx # Profile setup flow
├── components/           # Reusable React Native components
├── constants/            # App constants (colors, etc.)
├── lib/                  # Frontend utilities & context providers
├── server/               # Express.js backend
│   ├── routes.ts         # API route definitions
│   ├── admin-routes.ts   # Admin portal API routes
│   ├── db.ts             # Database connection
│   └── templates/        # HTML templates (admin portal)
├── shared/               # Shared code (schema)
├── uploads/              # User-uploaded files
│   ├── solos/            # Audio recordings
│   ├── avatars/          # Profile photos
│   └── vibes/            # Background audio tracks
└── docs/                 # Project documentation
```

## Key Concepts

- **Solos**: Audio posts created by users
- **Vibes**: Background ambient tracks mixed into recordings
- **Tags**: Category labels on solos for discovery
- **Creator Suite**: The recording interface with teleprompter and waveform tools
