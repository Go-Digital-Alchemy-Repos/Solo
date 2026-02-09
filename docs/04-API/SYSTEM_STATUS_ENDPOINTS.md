# System Status API Endpoints

All endpoints require admin authentication.

Base path: `/api/admin/system-status`

## GET /health

Returns a comprehensive health report for all monitored subsystems.

**Response:**
```json
{
  "ok": true,
  "data": {
    "timestamp": "2026-02-09T23:00:00.000Z",
    "server": {
      "ok": true,
      "uptimeSeconds": 3600,
      "nodeVersion": "v20.x.x",
      "env": "development"
    },
    "db": { "ok": true, "latencyMs": 2 },
    "sessions": { "ok": true, "latencyMs": 3, "activeSessions": 5 },
    "storage": { "ok": true, "solosDir": true, "avatarsDir": true },
    "ffmpeg": { "ok": true, "version": "6.0" },
    "transcription": { "ok": true, "model": "gpt-4o-mini-transcribe", "apiKeyConfigured": true }
  }
}
```

## GET /events

Returns paginated system events with optional filters.

**Query Parameters:**
| Param    | Type   | Default | Description                          |
|----------|--------|---------|--------------------------------------|
| limit    | number | 50      | Max results (capped at 200)          |
| level    | string | —       | Filter by level: info, warn, error   |
| source   | string | —       | Filter by source module              |
| resolved | string | —       | "true" or "false"                    |
| cursor   | string | —       | ISO timestamp for cursor pagination  |

**Response:**
```json
{
  "ok": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "createdAt": "2026-02-09T23:00:00.000Z",
        "level": "error",
        "source": "error-handler",
        "eventType": "server_error",
        "message": "Database connection failed",
        "details": { "code": "INTERNAL_ERROR" },
        "requestId": "req-abc123",
        "userId": null,
        "soloId": null,
        "resolvedAt": null,
        "resolvedByUserId": null,
        "resolutionNote": null
      }
    ],
    "summary": { "info": 0, "warn": 2, "error": 5 },
    "nextCursor": "2026-02-09T22:59:00.000Z"
  }
}
```

## POST /events/:eventId/resolve

Marks a system event as resolved.

**Body:**
```json
{ "resolutionNote": "Fixed database connection pool" }
```

**Response:** Returns the updated event object.

**Errors:**
- 404: Event not found
- 400: Event already resolved

## GET /request-logs

Returns paginated HTTP request logs.

**Query Parameters:**
| Param     | Type   | Default | Description                        |
|-----------|--------|---------|------------------------------------|
| limit     | number | 50      | Max results (capped at 200)        |
| minStatus | number | 0       | Minimum HTTP status code           |
| path      | string | —       | Path substring filter (ILIKE)      |
| cursor    | string | —       | ISO timestamp for cursor pagination|

**Response:**
```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "createdAt": "2026-02-09T23:00:00.000Z",
        "requestId": "req-abc123",
        "method": "GET",
        "path": "/api/solos",
        "status": 500,
        "durationMs": 45,
        "userId": "user-id",
        "ip": "127.0.0.1",
        "userAgent": "Mozilla/5.0..."
      }
    ],
    "nextCursor": null
  }
}
```

## POST /solos/:soloId/retry

Retries a failed solo processing job.

**Constraints:**
- Solo must be in `failed` status
- Max 5 retry attempts

**Response:**
```json
{ "ok": true, "data": { "soloId": "uuid", "newAttempt": 2 } }
```

## POST /transcription/test

Tests the OpenAI transcription API connection.

**Rate Limit:** 1 request per 5 seconds.

**Response:**
```json
{ "ok": true, "data": { "success": true, "modelsAvailable": true } }
```

## GET /verbose-logging

Returns current verbose logging state.

**Response:**
```json
{ "ok": true, "data": { "enabled": false } }
```

## POST /verbose-logging

Toggles verbose request logging. Development only.

**Body:**
```json
{ "enabled": true }
```

**Response:**
```json
{ "ok": true, "data": { "enabled": true } }
```
