# Admin Portal

## Overview
- The Admin Portal is a web-based administration interface for managing the Solo platform
- It provides dashboards for monitoring app metrics, managing users, and browsing project documentation
- Accessible at `/admin` on the Express backend, protected by admin authentication

## Architecture
- Single-page HTML application served from `server/templates/admin.html`
- Backend routes defined in `server/admin-routes.ts` with `requireAdmin` middleware
- Uses the same session-based auth system as the main app with an `is_admin` flag check
- Data flow: Admin login -> Session created -> API calls with session cookie -> UI renders data

### Key Files
- `server/templates/admin.html` — Complete admin portal UI (HTML/CSS/JS)
- `server/admin-routes.ts` — All admin API endpoint definitions
- `server/utils/routeScanner.ts` — Route scanner for API doc generation

## Tabs

### Reports Dashboard
- Total users and solos counts
- New users/solos trends (today, 7 days, 30 days)
- Average solo duration
- Top contributors table (top 10 by solo count)
- Category/tag breakdown
- Recent activity feed

### App Users Management
- Searchable, paginated user list
- Columns: email, username, role, solo count, join date
- Edit user: change username, bio, toggle admin status
- Delete user: cascades to delete all user's solos
- Self-deletion prevention for admin safety

### App Docs (Doc Browser + Coverage Dashboard)
- **Doc Browser**: Sidebar with categorized docs + content viewer with markdown rendering
- **Coverage Dashboard**: API and functional documentation coverage tracking with progress bars
- **API Sync**: Auto-generate API reference docs from route files
- See `Admin Docs Browser` doc for full details

## APIs

### POST /api/admin/login
- **Auth**: None (creates session)
- **Request**: `{ "email": "...", "password": "..." }`
- **Response**: `{ id, email, username, isAdmin }`
- **Error cases**: 400 (missing fields), 401 (invalid credentials), 403 (not admin)

### GET /api/admin/me
- **Auth**: Admin required
- **Response**: `{ id, email, username, isAdmin }`

### POST /api/admin/logout
- **Auth**: Any authenticated user
- **Response**: `{ success: true }`

### GET /api/admin/stats
- **Auth**: Admin required
- **Response**: Full stats object with user/solo counts, trends, top posters, tag stats

### GET /api/admin/users
- **Auth**: Admin required
- **Query params**: `page`, `limit`, `search`
- **Response**: `{ users: [...], total, page, pages }`

### PUT /api/admin/users/:userId
- **Auth**: Admin required
- **Request**: `{ username?, bio?, isAdmin? }`
- **Response**: Updated user object

### DELETE /api/admin/users/:userId
- **Auth**: Admin required
- **Response**: `{ success: true }`
- **Notes**: Cannot delete self, cascades to solos

## Security Considerations
- `requireAdmin` middleware checks both session authentication and `is_admin` database flag
- Admin login uses the same bcrypt password verification as the main app
- Session cookies are httpOnly and signed
- Path traversal prevented on docs endpoint

## Operational Notes
- Admin portal is served as static HTML on the Express server, separate from the Expo app
- Adding new admins: set `is_admin = true` on the user's database record
- The portal works in both development and production environments
- No separate build step required — it's a standalone HTML file

## Related Docs
- Docs Governance System (`02-ARCHITECTURE/DOCS_GOVERNANCE`)
- Security (`07-SECURITY/README`)
- Admin Docs Browser (`03-FEATURES/ADMIN_DOCS_BROWSER`)
- Admin Docs API Endpoints (`04-API/ADMIN_DOCS_ENDPOINTS`)
