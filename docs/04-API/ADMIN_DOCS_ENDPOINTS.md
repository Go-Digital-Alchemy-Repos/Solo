# Admin Docs API Endpoints

## Overview
- Four API endpoints power the file-based documentation system in the admin portal
- All endpoints require admin authentication and are defined in `server/admin-routes.ts`
- These endpoints replaced the previous database-backed docs CRUD API

## APIs

### GET /api/admin/docs — List All Documentation

**Auth**: Admin required (session-based, `is_admin` flag)

**Response** (200):
```json
{
  "categories": [
    {
      "id": "01-GETTING-STARTED",
      "displayName": "Getting Started",
      "icon": "rocket",
      "order": 1,
      "docs": [
        {
          "id": "01-GETTING-STARTED__README",
          "filename": "README.md",
          "title": "Getting Started",
          "category": "01-GETTING-STARTED",
          "relativePath": "01-GETTING-STARTED/README.md",
          "sizeBytes": 1456,
          "modifiedAt": "2026-02-09T18:00:00.000Z"
        }
      ]
    }
  ]
}
```

**Error Cases**:
- 401: Not authenticated
- 403: Not admin
- 500: Failed to scan docs directory

---

### GET /api/admin/docs/:docPath — Read Single Document

**Auth**: Admin required

**Path Parameter**: `docPath` — File path with `/` replaced by `__`, no `.md` extension. Example: `03-FEATURES__FEED`

**Response** (200):
```json
{
  "id": "03-FEATURES__FEED",
  "filename": "FEED.md",
  "title": "Feed",
  "content": "# Feed\n\nThe Feed tab displays...",
  "relativePath": "03-FEATURES/FEED.md",
  "sizeBytes": 892,
  "modifiedAt": "2026-02-09T18:00:00.000Z"
}
```

**Error Cases**:
- 400: Path contains `..` (traversal attempt) or resolves outside docs directory
- 401: Not authenticated
- 403: Not admin
- 404: Document file not found
- 500: Read failure

---

### POST /api/admin/docs/sync — Auto-Generate API Registry

**Auth**: Admin required

**Request Body**: None

**Response** (200):
```json
{
  "success": true,
  "summary": {
    "created": 2,
    "updated": 0,
    "skipped": 0,
    "errors": 0
  },
  "details": [
    { "domain": "core", "file": "CORE.md", "action": "created" },
    { "domain": "admin", "file": "ADMIN.md", "action": "created" }
  ]
}
```

**Notes**:
- Scans `server/routes.ts` and `server/admin-routes.ts` for route patterns
- Creates new stub docs or updates existing ones in `docs/17-API-REGISTRY/`
- Preserves manually-written notes between auto-generated sections

---

### GET /api/admin/docs/coverage — Documentation Coverage Report

**Auth**: Admin required

**Response** (200):
```json
{
  "api": {
    "total": 2,
    "withDocs": 2,
    "withAuth": 1,
    "withExamples": 1,
    "coveragePercent": 100,
    "domains": [
      {
        "domain": "core",
        "displayName": "Core API",
        "endpointCount": 15,
        "hasDoc": true,
        "hasAuth": true,
        "hasExamples": true
      }
    ]
  },
  "functional": {
    "total": 5,
    "withDocs": 2,
    "coveragePercent": 40,
    "docs": [
      {
        "id": "USER_AUTHENTICATION",
        "name": "User Authentication",
        "exists": true,
        "isEmpty": false,
        "wordCount": 350
      }
    ]
  }
}
```

## Security Considerations
- All endpoints protected by `requireAdmin` — checks session and `is_admin` flag
- Path traversal prevented on the `:docPath` parameter via `..` check and path resolution validation
- Sync endpoint only writes to `docs/17-API-REGISTRY/` directory

## Related Docs
- Docs Governance System (`02-ARCHITECTURE/DOCS_GOVERNANCE`)
- Admin Docs Browser (`03-FEATURES/ADMIN_DOCS_BROWSER`)
- API Reference (`04-API/README`)
