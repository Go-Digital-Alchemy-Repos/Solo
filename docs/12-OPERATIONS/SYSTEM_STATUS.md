# System Status & Health Monitoring

## Overview

The System Status module provides real-time health monitoring, structured event logging, and request auditing through the admin portal's **System Status** tab.

## Health Dashboard

The health check monitors five subsystems:

| Service       | Check                        | Details Reported               |
|---------------|------------------------------|-------------------------------|
| Server        | Process uptime               | Uptime, Node version, env     |
| Database      | `SELECT 1` query             | Latency in ms                 |
| Sessions      | Active session count         | Number of non-expired sessions|
| Storage       | Write/read/delete test file  | solos/avatars dir existence   |
| FFmpeg        | `ffmpeg -version` check      | Version string (cached 5 min) |
| Transcription | OpenAI API key presence      | Model name, key status        |

### Endpoints

- `GET /api/admin/system-status/health` — Returns full health report

## Event Logging

System events are logged to the `system_events` table for tracking errors, warnings, and info-level events across the application.

### How Events Are Created

- **Error handler**: All 500+ errors automatically log a `server_error` event
- **Unhandled errors**: Caught by Express error middleware, logged as `unhandled_error`
- **Client telemetry**: Client-side crashes reported via `/api/telemetry/error` create `client_error` events
- **Manual logging**: Any server code can use `eventLogger.info/warn/error()` to create events

### Event Structure

| Field            | Description                          |
|------------------|--------------------------------------|
| level            | `info`, `warn`, or `error`           |
| source           | Origin module (e.g., `error-handler`, `client`) |
| eventType        | Event category (e.g., `server_error`, `client_error`) |
| message          | Human-readable description (max 2000 chars) |
| details          | JSON metadata (sensitive data redacted) |
| requestId        | Correlated request ID                |
| userId           | Associated user (if authenticated)   |
| soloId           | Associated solo (if applicable)      |
| resolvedAt       | When an admin resolved the event     |
| resolutionNote   | Admin's resolution comment           |

### Data Redaction

The event logger automatically redacts values for these keys:
`password`, `token`, `secret`, `authorization`, `cookie`, `session`, `api_key`, `credit_card`, `ssn`, `connect.sid`

### Endpoints

- `GET /api/admin/system-status/events` — List events with filters
  - Query params: `level`, `source`, `resolved` (true/false), `cursor`, `limit`
  - Returns event list + unresolved count summary by level
- `POST /api/admin/system-status/events/:eventId/resolve` — Mark event resolved
  - Body: `{ resolutionNote?: string }`

## Request Logging

HTTP requests are logged to the `request_logs` table when:
- The response status is 400 or higher (errors), OR
- `VERBOSE_REQUEST_LOGS=true` is set (all API requests)

### Logged Fields

| Field     | Description                    |
|-----------|-------------------------------|
| requestId | Unique request correlation ID |
| method    | HTTP method                   |
| path      | Request path                  |
| status    | Response status code          |
| durationMs| Request processing time       |
| userId    | Authenticated user (if any)   |
| ip        | Client IP address             |
| userAgent | Browser/client user agent     |

### Endpoints

- `GET /api/admin/system-status/request-logs` — List request logs
  - Query params: `minStatus`, `path`, `cursor`, `limit`

## Verbose Logging

Verbose logging can be toggled at runtime to capture ALL API requests (not just errors).

- `GET /api/admin/system-status/verbose-logging` — Check current state
- `POST /api/admin/system-status/verbose-logging` — Toggle on/off
  - Body: `{ enabled: boolean }`
  - Only available in development mode

## Transcription Test

Validates the OpenAI API integration by listing available models.

- `POST /api/admin/system-status/transcription/test` — Test transcription API
  - Rate limited: 1 request per 5 seconds

## Admin Portal UI

The **System Status** tab in the admin portal (`/admin`) provides:

1. **Health Cards** — Visual grid showing each service status with green/red indicators
2. **Events Table** — Filterable list of system events with resolve actions
3. **Request Logs Table** — HTTP request audit trail with status color coding
4. **Verbose Toggle** — Runtime switch for full request logging
5. **Transcription Test** — One-click API validation
