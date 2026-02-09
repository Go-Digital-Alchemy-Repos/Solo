# Documentation System — Database Notes

## Overview
- The documentation system is file-based and does not use database tables for storing docs
- The legacy `app_docs` table remains in the schema for backward compatibility but is no longer actively used by the docs browser
- This entry documents the schema state and the transition from DB-backed to file-based docs

## Database

### app_docs (Legacy — No Longer Used by Docs Browser)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key (auto-increment) |
| title | varchar | Document title |
| content | text | Document content (Markdown) |
| category | varchar | Category name |
| sort_order | integer | Display ordering (default 0) |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

**Status**: This table is still defined in `shared/schema.ts` but the admin docs API no longer reads from or writes to it. Documentation is now served directly from `.md` files in the `docs/` directory.

### Migration Notes
- No new migrations were needed for the file-based system
- The `app_docs` table can be safely dropped in a future cleanup if desired
- The `is_admin` column on the `users` table (boolean, default false) gates access to the docs system

## Related Docs
- Docs Governance System (`02-ARCHITECTURE/DOCS_GOVERNANCE`)
- Database Overview (`08-DATABASE/README`)
- Admin Docs Browser (`03-FEATURES/ADMIN_DOCS_BROWSER`)
