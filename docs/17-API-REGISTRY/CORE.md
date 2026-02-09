# Core API

## Module Info

| Property | Value |
|----------|-------|
| Domain | core |
| Source Files | routes.ts |
| Endpoint Count | 16 |

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
| `POST` | `/api/auth/signup` | routes.ts:192 |
| `POST` | `/api/auth/login` | routes.ts:231 |
| `POST` | `/api/auth/logout` | routes.ts:266 |
| `GET` | `/api/auth/me` | routes.ts:276 |
| `PUT` | `/api/auth/profile` | routes.ts:300 |
| `GET` | `/api/avatars/:fileName` | routes.ts:355 |
| `GET` | `/api/vibes` | routes.ts:373 |
| `GET` | `/api/vibes/:vibeId/audio` | routes.ts:377 |
| `POST` | `/api/solos` | routes.ts:392 |
| `GET` | `/api/solos` | routes.ts:454 |
| `DELETE` | `/api/solos/:soloId` | routes.ts:469 |
| `PUT` | `/api/solos/:soloId` | routes.ts:497 |
| `GET` | `/api/solos/user/:userId` | routes.ts:533 |
| `GET` | `/api/audio/:fileId` | routes.ts:549 |
| `POST` | `/api/solos/:soloId/transcribe` | routes.ts:607 |
| `GET` | `/admin` | routes.ts:643 |

*16 endpoints total. Auto-generated on 2026-02-09.*

<!-- === END AUTO-GENERATED SECTION === -->
