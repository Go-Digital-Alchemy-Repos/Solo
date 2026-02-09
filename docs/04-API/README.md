# API Reference

All API routes are prefixed with `/api` and defined in `server/routes.ts`.

## Authentication

### POST /api/auth/signup
Create a new account.

**Request Body:**
```json
{ "email": "user@example.com", "password": "password123" }
```

### POST /api/auth/login
Sign in with credentials.

### POST /api/auth/logout
Destroy the current session.

### GET /api/auth/me
Get the current authenticated user.

### PUT /api/auth/profile
Update username, bio, or avatar. Multipart form with optional `avatar` file.

## Solos

### POST /api/solos
Upload a new audio recording. Requires authentication.

**Form Fields:** `audio` (file), `title`, `durationMs`, `tags` (JSON array), `trimStartMs`, `trimEndMs`, `vibeId`

### GET /api/solos
List all recordings. Optional `?tag=` filter.

### PUT /api/solos/:soloId
Update solo title or tags. Owner only.

### DELETE /api/solos/:soloId
Delete a solo and its audio file. Owner only.

### POST /api/solos/:soloId/transcribe
Generate a word-level transcript using OpenAI.

## Audio

### GET /api/audio/:fileId
Stream an audio file with byte-range support.

## Admin

### POST /api/admin/login
Admin portal authentication.

### GET /api/admin/stats
Dashboard statistics (users, solos, trends).

### GET /api/admin/users
Paginated user list with search.

### GET /api/admin/docs
List all documentation files.

### GET /api/admin/docs/:docPath
Read a single documentation file.

### POST /api/admin/docs/sync
Auto-generate API reference documentation.

### GET /api/admin/docs/coverage
Documentation coverage report.
