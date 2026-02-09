# Solo — Troubleshooting Guide

## Quick Diagnostics

### 1. Check Server Health
```
GET /api/auth/me          → 200 if session is valid, 401 if not
GET /api/solos            → 200 returns feed, 500 if DB issue
GET /api/vibes            → 200 returns vibes list
```

### 2. Check Processing Pipeline
```
GET /api/admin/processing-jobs?status=failed   → list failed jobs
GET /api/admin/processing-jobs?limit=5         → last 5 jobs (any status)
```

### 3. Check Client Errors
```
GET /api/admin/client-errors   → recent client-side crash reports
```

---

## Common Issues

### "White screen" on mobile
**Symptoms**: App loads but shows nothing, or crashes immediately.

**Steps**:
1. Check browser console / Expo Go logs for JavaScript errors
2. Look at `/api/admin/client-errors` for crash reports
3. The ErrorBoundary should catch render crashes and show a "Something went wrong" screen with a "Try Again" button
4. If ErrorBoundary itself fails, check `_layout.tsx` for provider initialization errors

**Common causes**:
- Font loading failure (DM Sans) — app waits for fonts, timeout shows splash
- Auth context error — check `/api/auth/me` is reachable
- Missing env var `EXPO_PUBLIC_DOMAIN` on client

### Session / Auth Issues
**Symptoms**: User gets logged out unexpectedly, 401 errors on authenticated endpoints.

**Steps**:
1. Check server logs for `401` responses with request IDs
2. Verify `SESSION_SECRET` env var is set
3. Check PostgreSQL `session` table: `SELECT count(*) FROM session;`
4. Session cookie uses `sameSite: 'none'` + `secure: true` — ensure HTTPS

**Common causes**:
- Session store pool exhaustion (check for connection errors in logs)
- Cookie not sent on mobile — check `authFetch` includes cookie header
- `connect.sid` cookie expired (30-day max)

### Audio Upload Fails
**Symptoms**: Recording completes but upload times out or returns 500.

**Steps**:
1. Check server logs for the request ID from the upload response
2. Verify `uploads/solos/` directory exists and is writable
3. Check disk space: `df -h`
4. Check file size — max is 50MB (`express.json` limit)

### Feed Shows No Posts
**Symptoms**: Feed tab is empty even though recordings were made.

**Steps**:
1. Check if solos exist: `SELECT count(*), status FROM solos GROUP BY status;`
2. Feed only shows `status = 'ready'` solos
3. If all solos are `processing` or `failed`, check the processing pipeline
4. Verify the user's solos: `GET /api/solos/user/:userId`

---

## Processing Pipeline Failures

### Understanding the Pipeline
Each solo goes through: `queued → processing (trim → mix → upload → transcribe) → ready`

If any step fails, the solo enters `failed` state with the error stored in `processing_error`.

### Admin Debug Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/processing-jobs` | GET | List recent jobs (query: `?status=failed&limit=20`) |
| `/api/admin/processing-jobs/:soloId/retry` | POST | Retry a failed job |
| `/api/admin/processing-jobs/:soloId/fail` | POST | Mark a stuck job as failed |
| `/api/admin/processing-jobs/:soloId/reset` | POST | Reset job to queued with 0 attempts |

### Diagnosing a Failed Job
1. Get the job details: `GET /api/admin/processing-jobs?status=failed`
2. Check `processingError` field for the error message
3. Check `processingStep` to see which step failed
4. Check `attempts` to see how many retries have been attempted
5. Look at server logs for `solo=XXXXXXXX` entries

### Stuck in "processing" State
If a solo stays in `processing` for more than 5 minutes:
1. The server may have restarted mid-processing
2. Use `POST /api/admin/processing-jobs/:soloId/fail` to mark it failed
3. Then `POST /api/admin/processing-jobs/:soloId/retry` to retry

---

## Request Tracing

Every API response includes an `X-Request-Id` header. Error responses also include `requestId` in the JSON body.

### Log Format
```
2026-02-09T12:00:00.000Z [INFO] rid=abc123def456 GET /api/solos 200 15ms uid=user1234
```

Fields:
- `rid` — request ID (12-char hex), matches `X-Request-Id` header
- `uid` — first 8 chars of user ID (if authenticated)
- `solo` — first 8 chars of solo ID (in processing logs)
- `step` — current processing step

### Filtering Logs
Search for a specific request:
```bash
grep "rid=abc123" logs/backend.log
```

Search for a user's requests:
```bash
grep "uid=user1234" logs/backend.log
```

Search for processing issues:
```bash
grep "\\[ERROR\\]" logs/backend.log
grep "solo=XXXXXXXX" logs/backend.log
```

---

## Database Queries for Debugging

### Check processing job status
```sql
SELECT id, username, title, status, processing_step, processing_error, attempts,
       created_at, updated_at, ready_at
FROM solos
WHERE status != 'ready'
ORDER BY updated_at DESC
LIMIT 20;
```

### Find stuck jobs (processing for > 5 min)
```sql
SELECT id, status, processing_step, updated_at
FROM solos
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

### Session health
```sql
SELECT count(*) as total_sessions,
       count(*) FILTER (WHERE expire > NOW()) as active,
       count(*) FILTER (WHERE expire <= NOW()) as expired
FROM session;
```

### User lookup
```sql
SELECT id, email, username, is_admin, role, created_at
FROM users
WHERE email ILIKE '%search%' OR username ILIKE '%search%';
```
