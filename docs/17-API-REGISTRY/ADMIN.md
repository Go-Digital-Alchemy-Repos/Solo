# Admin API

## Module Info

| Property | Value |
|----------|-------|
| Domain | admin |
| Source Files | admin-routes.ts |
| Endpoint Count | 11 |

## Authentication & Authorization

| Aspect | Details |
|--------|---------|
| Auth Required | TBD |
| Admin Only | TBD |
| Rate Limited | TBD |

## Notes

*Add manual documentation notes here. This section is preserved during API sync.*

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

## Endpoints

| Method | Path | Source |
|--------|------|--------|
| `POST` | `/api/admin/login` | admin-routes.ts:27 |
| `GET` | `/api/admin/me` | admin-routes.ts:61 |
| `POST` | `/api/admin/logout` | admin-routes.ts:74 |
| `GET` | `/api/admin/stats` | admin-routes.ts:84 |
| `GET` | `/api/admin/users` | admin-routes.ts:178 |
| `PUT` | `/api/admin/users/:userId` | admin-routes.ts:253 |
| `DELETE` | `/api/admin/users/:userId` | admin-routes.ts:294 |
| `GET` | `/api/admin/docs` | admin-routes.ts:433 |
| `GET` | `/api/admin/docs/coverage` | admin-routes.ts:446 |
| `GET` | `/api/admin/docs/:docPath` | admin-routes.ts:543 |
| `POST` | `/api/admin/docs/sync` | admin-routes.ts:584 |

*11 endpoints total. Auto-generated on 2026-02-09.*

<!-- === END AUTO-GENERATED SECTION === -->
