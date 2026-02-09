# Admin Docs Browser

## Overview
- The Docs Browser is a searchable, categorized documentation viewer built into the Solo admin portal
- It provides an in-app way for developers and admins to browse project documentation without leaving the admin interface
- Accessible at `/admin` under the "App Docs" tab, with two sub-views: Doc Browser and Coverage Dashboard

## Architecture
- Single-page HTML app served from `server/templates/admin.html`
- Backend scans the `docs/` directory on each request (no database required)
- File path encoding: folder separators become `__` for URL-safe doc IDs
- Markdown rendering handled client-side with a custom lightweight renderer (no external library)
- Data flow: Sidebar click -> `GET /api/admin/docs/:docPath` -> Content panel renders markdown

### Key Files
- `server/templates/admin.html` — Full admin portal UI including Doc Browser
- `server/admin-routes.ts` — API endpoints for docs list, read, sync, coverage
- `server/utils/routeScanner.ts` — Route scanning utility for API doc generation
- `docs/` — Source markdown files organized in numbered folders

## Database
- No database tables are used for the file-based docs system
- The legacy `app_docs` table still exists in the schema but is no longer used by the docs browser

## APIs

### GET /api/admin/docs
- **Auth**: Admin required (`requireAdmin` middleware)
- **Response**: `{ categories: [{ id, displayName, icon, order, docs: [{ id, filename, title, category, relativePath, sizeBytes, modifiedAt }] }] }`
- **Error cases**: 401 (not authenticated), 403 (not admin), 500 (scan failure)

### GET /api/admin/docs/:docPath
- **Auth**: Admin required
- **Request**: `docPath` param uses `__` as path separator (e.g., `03-FEATURES__FEED`)
- **Response**: `{ id, filename, title, content, relativePath, sizeBytes, modifiedAt }`
- **Error cases**: 400 (path traversal), 404 (not found), 401/403/500

### POST /api/admin/docs/sync
- **Auth**: Admin required
- **Response**: `{ success, summary: { created, updated, skipped, errors }, details: [{ domain, file, action }] }`
- **Notes**: Generates/updates API registry docs in `docs/17-API-REGISTRY/`

### GET /api/admin/docs/coverage
- **Auth**: Admin required
- **Response**: `{ api: { total, withDocs, withAuth, withExamples, coveragePercent, domains }, functional: { total, withDocs, coveragePercent, docs } }`

## Frontend Integration
- Doc Browser is part of the admin portal SPA at `/admin`
- Left sidebar (320px): search input, collapsible categories with SVG icons, doc count badges
- Right panel: welcome state or rendered markdown with metadata bar
- Coverage Dashboard: progress bars, missing/incomplete lists, two-column detail grid
- Toggle between Browser and Coverage views via buttons at top of docs tab

### Markdown Renderer Features
- Headings (h1-h4), bullet/numbered lists, blockquotes
- Fenced code blocks with dark background
- Inline code, bold text, links (open in new tab)
- Tables with proper styling
- Horizontal rules

## Security Considerations
- All docs endpoints require admin authentication via `requireAdmin` middleware
- Path traversal prevention: `..` blocked, resolved path must be inside `docs/` directory
- Doc content is read-only through the API (no write/delete endpoints for files)

## Operational Notes
- Docs are scanned from disk on every request (no caching) — fast for typical doc counts
- Adding new docs: create a `.md` file in the appropriate `docs/NN-CATEGORY/` folder
- Adding new categories: create a new numbered folder and add config entry in `CATEGORY_CONFIG`
- API Sync can be triggered from the UI or via POST to `/api/admin/docs/sync`

## Related Docs
- Docs Governance System (`02-ARCHITECTURE/DOCS_GOVERNANCE`)
- API Reference (`04-API/README`)
- Security (`07-SECURITY/README`)
