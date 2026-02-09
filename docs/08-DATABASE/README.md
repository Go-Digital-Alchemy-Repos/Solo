# Database

Solo uses PostgreSQL with Drizzle ORM for data persistence.

## Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | varchar | Unique email address |
| password_hash | text | bcrypt-hashed password |
| username | varchar | Unique username (nullable until profile setup) |
| avatar_url | text | Path to avatar image |
| bio | text | User biography |
| is_admin | boolean | Admin portal access flag |
| created_at | timestamp | Account creation time |

### solos
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| username | varchar | Denormalized username |
| audio_url | text | Path to audio file |
| timestamp | timestamp | Post creation time |
| tags | text[] | Category tags |
| title | varchar | Solo title |
| duration_ms | integer | Audio duration in ms |
| display_name | varchar | Display name at time of post |
| transcript | jsonb | Word-level transcript |

### app_docs
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| title | varchar | Document title |
| content | text | Document content |
| category | varchar | Category name |
| sort_order | integer | Display order |

## Migrations

Schema is managed with `drizzle-kit push`. Use `--force` flag to avoid session table conflicts.
