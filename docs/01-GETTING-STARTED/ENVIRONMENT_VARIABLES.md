# Environment Variables

## Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for signing session cookies |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `EXPO_PACKAGER_PROXY_URL` | Replit proxy URL for Expo dev server | Auto-detected |
| `REACT_NATIVE_PACKAGER_HOSTNAME` | Hostname for Metro bundler | Auto-detected |

## OpenAI Integration

The app uses OpenAI for audio transcription. The API key is managed through Replit's AI integrations system and is automatically available as `AI_INTEGRATIONS_OPENAI_API_KEY`.
