# API Error Contract

All API error responses follow a single, predictable shape. This makes it straightforward for any client — mobile app, admin portal, or third-party integration — to handle errors consistently.

## Standard Error Envelope

Every error response uses this structure:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Human-readable explanation",
    "details": {}
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ok` | `boolean` | Yes | Always `false` for errors |
| `error.code` | `string` | Yes | Machine-readable error code (see table below) |
| `error.message` | `string` | Yes | Human-readable explanation |
| `error.details` | `object` | No | Additional context, present for validation errors |

## Error Codes

| Code | HTTP Status | When Used |
|------|-------------|-----------|
| `BAD_REQUEST` | 400 | Missing or invalid input that doesn't fit a specific code |
| `VALIDATION_ERROR` | 400 | Schema validation failed (includes field-level details) |
| `UNAUTHORIZED` | 401 | No valid session / not logged in |
| `FORBIDDEN` | 403 | Authenticated but lacks permission (e.g., not admin, not owner) |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource (email taken, username taken) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Validation Error Details

When `code` is `VALIDATION_ERROR`, the `details` object contains a `fields` map:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "fields": {
        "password": ["Password must be at least 6 characters"],
        "email": ["Invalid email format"]
      }
    }
  }
}
```

Each key is a field name. Each value is an array of error messages for that field.

## 401 vs 403 Rules

- **401 UNAUTHORIZED**: The request has no valid session. The client should redirect to login.
- **403 FORBIDDEN**: The user is authenticated but does not have the required role or ownership. For example:
  - A non-admin accessing `/api/admin/*` endpoints.
  - A user trying to delete another user's solo.

## Success Responses

Success responses are endpoint-specific. Destructive operations (delete, logout) return:

```json
{
  "ok": true
}
```

## Implementation

Errors are implemented via the `AppError` class in `server/lib/errors.ts`. The global error handler in `server/middleware/errorHandler.ts` catches thrown `AppError` instances and formats them into the standard envelope. Unhandled errors are caught and returned as `INTERNAL_ERROR`.
