# Security

## Authentication
- Password hashing with bcrypt (12 salt rounds)
- Session-based auth with PostgreSQL-backed sessions
- 30-day session expiry with httpOnly cookies
- Secure cookies in production mode

## Authorization
- Route-level auth middleware (`requireAuth`)
- Admin routes protected by `requireAdmin` middleware
- Users can only edit/delete their own content

## Input Validation
- Email normalization (lowercase, trimmed)
- Username validation (3-20 chars, lowercase alphanumeric + underscores)
- File upload size limits (50MB max)
- Path traversal prevention on file access routes

## Session Management
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Session cookies are httpOnly and signed
- Mobile clients store session cookie in AsyncStorage
