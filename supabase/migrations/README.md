# Supabase Migrations

This directory contains SQL migration files for the AISIS Scraper database schema.

## Migration Files

### 20250123000000_add_curriculum_versions_unique_constraint.sql

**Purpose**: Add UNIQUE constraint on `curriculum_versions` table to support idempotent upserts.

**Background**: The curriculum ingestion edge function performs upserts with:
```typescript
.upsert(..., { onConflict: 'program_id,version_year,version_sem,version_seq' })
```

However, the `curriculum_versions` table only had a primary key on `id`. This caused Postgres to throw:
> there is no unique or exclusion constraint matching the ON CONFLICT specification

**Changes**:
- Adds `UNIQUE (program_id, version_year, version_sem, version_seq)` constraint
- Named: `curriculum_versions_program_version_unique`
- Includes duplicate detection query to run before applying in production

**Before Applying**:
1. Run the duplicate detection query (included in the migration file comments)
2. Resolve any duplicate records manually
3. Apply the migration

**Rollback**:
```sql
ALTER TABLE curriculum_versions
DROP CONSTRAINT curriculum_versions_program_version_unique;
```

## Applying Migrations

### Using Supabase CLI

```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_ID

# Apply migrations
supabase db push
```

### Manual Application

1. Connect to your Supabase database (SQL Editor or psql)
2. Run the SQL from the migration file
3. Verify the constraint was created:
   ```sql
   SELECT constraint_name, constraint_type 
   FROM information_schema.table_constraints 
   WHERE table_name = 'curriculum_versions' 
     AND constraint_name = 'curriculum_versions_program_version_unique';
   ```

## Migration Naming Convention

Migrations use the format: `YYYYMMDDHHMMSS_description.sql`

Example: `20250123000000_add_curriculum_versions_unique_constraint.sql`
- Timestamp: 2025-01-23 00:00:00
- Description: add_curriculum_versions_unique_constraint
