# Validation Rules

This document lists the validation rules enforced on each API endpoint that accepts input.

## Auth Endpoints

### POST /api/auth/signup

| Field | Rules |
|-------|-------|
| `email` | Required. Lowercased and trimmed. Must not already exist (409 CONFLICT). |
| `password` | Required. Minimum 6 characters. |

### POST /api/auth/login

| Field | Rules |
|-------|-------|
| `email` | Required. |
| `password` | Required. |

### PUT /api/auth/profile

| Field | Rules |
|-------|-------|
| `username` | Optional. Lowercased and trimmed. Must match `^[a-z0-9_]{3,20}$`. Must not be taken (409 CONFLICT). |
| `bio` | Optional. Trimmed, max 160 characters. |
| `avatar` | Optional. Multipart file upload (image). |
| *(general)* | At least one field must be provided (400 BAD_REQUEST). |

## Solo Endpoints

### POST /api/solos

| Field | Rules |
|-------|-------|
| `audio` | Required. Multipart file upload. |
| `title` | Required. |
| `durationMs` | Optional. Parsed as integer, defaults to 0. |
| `tags` | Optional. JSON string or array. |
| `trimStartMs` | Optional. Float, converted to seconds for ffmpeg. |
| `trimEndMs` | Optional. Float, converted to seconds for ffmpeg. |
| `vibeId` | Optional. String ID of a background vibe. |
| *(auth)* | Requires authenticated session (401 UNAUTHORIZED). User must have a username set (400 BAD_REQUEST). |

### PUT /api/solos/:soloId

| Field | Rules |
|-------|-------|
| `title` | Optional. |
| `tags` | Optional. JSON string or array. |
| *(general)* | At least one field must be provided (400 BAD_REQUEST). |
| *(auth)* | Requires authenticated session. Must be the solo owner (403 FORBIDDEN). |

### POST /api/solos/:soloId/retry

| Field | Rules |
|-------|-------|
| *(auth)* | Requires authenticated session. Must be the solo owner (403 FORBIDDEN). |
| *(state)* | Solo must be in `failed` status (400 BAD_REQUEST). |

### DELETE /api/solos/:soloId

| Field | Rules |
|-------|-------|
| *(auth)* | Requires authenticated session. Must be the solo owner (403 FORBIDDEN). |

## Admin Endpoints

### POST /api/admin/login

| Field | Rules |
|-------|-------|
| `email` | Required. |
| `password` | Required. |
| *(role)* | User must have `is_admin = true` (403 FORBIDDEN). |

### PUT /api/admin/users/:userId

| Field | Rules |
|-------|-------|
| `username` | Optional. |
| `bio` | Optional. |
| `isAdmin` | Optional. Boolean. |
| *(general)* | At least one field must be provided (400 BAD_REQUEST). |
| *(auth)* | Requires admin session (401/403). |

### DELETE /api/admin/users/:userId

| Field | Rules |
|-------|-------|
| *(auth)* | Requires admin session (401/403). |
| *(safety)* | Cannot delete own admin account (400 BAD_REQUEST). |

### PUT /api/admin/integrations

| Field | Rules |
|-------|-------|
| `service` | Required. Must be one of: `mailgun`, `cloudflare_r2`, `twilio`. |
| `config` | Required. JSON object with service-specific fields. |
| `enabled` | Optional. Boolean, defaults to false. |
| *(auth)* | Requires admin session (401/403). |

## Validation Middleware

Zod-based validation middleware is available in `server/lib/validate.ts`:

- `validateBody(schema)` — Validates `req.body` against a Zod schema. On failure, throws a `VALIDATION_ERROR` AppError with field-level details.
- `validateQuery(schema)` — Validates `req.query` against a Zod schema. Parsed result is available on `req.validatedQuery`.
- `validateParams(schema)` — Validates `req.params` against a Zod schema.

Usage in routes:

```typescript
import { z } from "zod";
import { validateBody } from "../../lib/validate";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", validateBody(loginSchema), asyncHandler(controller.login));
```
