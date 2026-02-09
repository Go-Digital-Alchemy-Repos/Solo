# Docs Governance System

## Overview
- The Docs Governance System defines how project documentation is structured, created, and maintained across the Solo platform.
- It ensures every feature, API endpoint, database change, and admin route is documented consistently using a standard template.
- Documentation lives as `.md` files on the server filesystem in the `docs/` directory, organized into numbered category folders.

## Architecture
- Documentation source of truth: `docs/` directory with `NN-CATEGORY-NAME/` folder structure
- Backend scanner reads `.md` files on each API request (no database, no caching)
- Route Scanner utility (`server/utils/routeScanner.ts`) auto-generates API reference docs from Express route files
- Admin portal serves a Doc Browser UI and Coverage Dashboard at `/admin` under the "App Docs" tab
- File path encoding: `/` replaced with `__`, `.md` extension dropped to create URL-safe IDs

## Standard Doc Template

Every documentation entry should follow this structure:

```markdown
# <TITLE>

## Overview
- What was added/changed
- Why it exists (problem solved)
- Where it is used (admin/public)

## Architecture
- High-level flow
- Key modules/files involved
- Data flow (UI -> API -> DB)

## Database
- Tables affected
- Columns/indexes added/changed
- Migration notes

## APIs
- METHOD /path
- Auth requirements
- Request/response schemas
- Error cases

## Frontend Integration
- Routes/pages affected
- Components added/updated
- State management approach

## Security Considerations
- Validation, rate limiting, authorization
- File upload constraints
- Sensitive data handling

## Operational Notes
- Performance/caching
- Known limitations
- Local dev setup changes

## Related Docs
- Cross-links to related entries
```

## Category Structure

| Folder | Category | Icon |
|--------|----------|------|
| 01-GETTING-STARTED | Getting Started | rocket |
| 02-ARCHITECTURE | Architecture | layers |
| 03-FEATURES | Features | star |
| 04-API | API | code |
| 05-FRONTEND | Frontend | monitor |
| 06-BACKEND | Backend | server |
| 07-SECURITY | Security | shield |
| 08-DATABASE | Database | database |
| 09-TESTING | Testing | check-circle |
| 10-DEPLOYMENT | Deployment | upload |
| 11-DEVELOPMENT | Development | terminal |
| 12-OPERATIONS | Operations | settings |
| 13-INTEGRATIONS | Integrations | link |
| 14-TROUBLESHOOTING | Troubleshooting | alert-triangle |
| 15-REFERENCE | Reference | book |
| 16-CHANGELOG | Changelog | clock |
| 17-API-REGISTRY | API Registry | list |
| 18-FUNCTIONAL-DOCS | Functional Docs | file-text |

## Documentation Rules

1. **Non-destructive**: Never delete or overwrite existing docs; update or add new entries
2. **Technical and thorough**: Written for developers, not end users
3. **Cross-linked**: Every doc should link to at least 2 related docs
4. **Categorized consistently**: Use the closest matching category from the list above
5. **Minimum per change**: At least 1 Feature doc, 1 API doc, and 1 Database doc per significant change

## Auto-Generation

The Route Scanner can auto-generate API registry docs:
- Trigger via "Sync API Docs" button in the admin portal or `POST /api/admin/docs/sync`
- Scans `server/routes.ts` and `server/admin-routes.ts` for route patterns
- Creates stub documents in `docs/17-API-REGISTRY/` with endpoint tables
- Preserves manually-written notes between syncs using HTML comment markers
- Auto-generated sections are wrapped in `<!-- === AUTO-GENERATED SECTION === -->` markers

## Coverage Tracking

The Coverage Dashboard tracks:
- **API Coverage**: Which route domains have docs, auth notes, and code examples
- **Functional Coverage**: Which required functional docs exist and have sufficient content (100+ words)

Required functional docs are configured in `server/admin-routes.ts` in the `requiredFunctionalDocs` array.

## Related Docs
- Architecture Overview (`02-ARCHITECTURE/README`)
- API Reference (`04-API/README`)
- Admin Portal (`18-FUNCTIONAL-DOCS/ADMIN_PORTAL`)
