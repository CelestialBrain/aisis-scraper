# Deployment Guide: Batched Schedule Sync Fix

This guide walks through deploying the batched schedule sync fix to resolve 504 timeout errors.

## Overview

**Problem**: Syncing 3927 schedules to Supabase caused 504 Gateway Timeout
**Solution**: Two-layer batching (client: 500/request, server: 100/transaction)
**Result**: No timeouts, ~30-50 seconds for 4000 records

## Prerequisites

- Node.js 18+
- Supabase account and project
- Supabase CLI installed: `npm install -g supabase`

## Step 1: Link Your Supabase Project

```bash
cd /path/to/aisis-scraper

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_ID

# Verify the link
supabase status
```

## Step 2: Verify Database Schema

Ensure your `aisis_schedules` table has the correct unique constraint:

```sql
-- Check if the unique constraint exists
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'aisis_schedules' 
AND constraint_type = 'UNIQUE';

-- If it doesn't exist, create it
CREATE UNIQUE INDEX IF NOT EXISTS unique_schedule_entry 
  ON aisis_schedules(term_code, subject_code, section, department);
```

**CRITICAL**: The constraint must use these columns in this exact order:
- `term_code`
- `subject_code`
- `section`
- `department`

## Step 3: Deploy Edge Functions

Deploy all four Edge Functions to your Supabase project:

```bash
# Deploy the main data ingest function
supabase functions deploy github-data-ingest

# Deploy the scraper functions
supabase functions deploy aisis-scraper
supabase functions deploy scrape-department
supabase functions deploy import-schedules

# Verify deployments
supabase functions list
```

Expected output:
```
┌─────────────────────┬────────────┬─────────────────────────┐
│ Name                │ Version    │ Updated                 │
├─────────────────────┼────────────┼─────────────────────────┤
│ github-data-ingest  │ 1          │ 2025-11-22 14:xx:xx     │
│ aisis-scraper       │ 1          │ 2025-11-22 14:xx:xx     │
│ scrape-department   │ 1          │ 2025-11-22 14:xx:xx     │
│ import-schedules    │ 1          │ 2025-11-22 14:xx:xx     │
└─────────────────────┴────────────┴─────────────────────────┘
```

## Step 4: Update Edge Function URL (If Needed)

Check the current URL in `src/supabase.js`:

```javascript
this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-data-ingest';
```

If your project ID is different, update it:

```javascript
this.url = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/github-data-ingest';
```

## Step 5: Test Locally

### Test with Small Dataset

```bash
# Set environment variables
export AISIS_USERNAME="your_username"
export AISIS_PASSWORD="your_password"
export DATA_INGEST_TOKEN="your_token"
export APPLICABLE_PERIOD="2025-1"

# Run the scraper
npm start
```

Expected output:
```
☁️ Supabase: Syncing 127 schedules records...
📦 Batching into 1 requests...
📤 Sending batch 1/1 (127 records)...
✅ Supabase: All batches synced successfully (127/127 records)
```

### Test with Large Dataset (Full Term)

```bash
# Remove APPLICABLE_PERIOD to use auto-detected term
unset APPLICABLE_PERIOD

# Run the scraper for all departments
npm start
```

Expected output for ~3927 records:
```
☁️ Supabase: Syncing 3927 schedules records...
📦 Batching into 8 requests...
📤 Sending batch 1/8 (500 records)...
📤 Sending batch 2/8 (500 records)...
...
📤 Sending batch 8/8 (427 records)...
✅ Supabase: All batches synced successfully (3927/3927 records)
```

## Step 6: Verify Database

Check the database to ensure all records were synced:

```sql
-- Count total schedules for the term
SELECT COUNT(*) 
FROM aisis_schedules 
WHERE term_code = '2025-1';

-- Verify no duplicate entries
SELECT term_code, subject_code, section, department, COUNT(*) as count
FROM aisis_schedules
WHERE term_code = '2025-1'
GROUP BY term_code, subject_code, section, department
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

## Step 7: Test Idempotency

Run the scraper twice to ensure upsert behavior works correctly:

```bash
# First run
npm start

# Check row count
psql -h YOUR_DB_HOST -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM aisis_schedules WHERE term_code = '2025-1';"
# Note the count, e.g., 3927

# Second run
npm start

# Check row count again
psql -h YOUR_DB_HOST -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM aisis_schedules WHERE term_code = '2025-1';"
# Should be the same count (3927)
```

## Step 8: Monitor Edge Function Logs

View Edge Function logs in Supabase Dashboard:

1. Go to **Edge Functions** in your Supabase project
2. Click on `github-data-ingest`
3. View **Logs** tab

Look for:
- ✅ Batch processing: "Processing batch X/Y..."
- ✅ Success: "Batch X completed: Y records upserted"
- ❌ Errors: "Batch X failed: ..."

## Troubleshooting

### Still Getting 504 Timeouts?

1. **Reduce client batch size** in `src/supabase.js`:
   ```javascript
   const CLIENT_BATCH_SIZE = 250; // Reduced from 500
   ```

2. **Reduce server batch size** in Edge Functions:
   ```typescript
   const BATCH_SIZE = 50; // Reduced from 100
   ```

3. **Check database performance**:
   ```sql
   -- Check slow queries
   SELECT * FROM pg_stat_statements 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   ```

### Duplicate Key Violations?

If you see unique constraint errors:

1. Verify the `onConflict` key matches the constraint:
   ```sql
   -- Check constraint definition
   SELECT constraint_name, 
          pg_get_constraintdef(oid) as definition
   FROM pg_constraint
   WHERE conrelid = 'aisis_schedules'::regclass
   AND contype = 'u';
   ```

2. The constraint should be on: `(term_code, subject_code, section, department)`

### Missing Records?

1. Check Edge Function logs for validation errors
2. Verify all records have required fields:
   ```javascript
   // In your scraper, log any records missing required fields
   console.log('Missing fields:', record);
   ```

3. Look for partial success responses (HTTP 207)

### High Memory Usage?

If the scraper uses too much memory:

1. Reduce `CLIENT_BATCH_SIZE` in `src/supabase.js`
2. Consider processing departments sequentially instead of all at once
3. Use Node.js with increased memory: `node --max-old-space-size=4096 src/index.js`

## Performance Benchmarks

Expected sync times (approximate):

| Records | Client Requests | DB Batches | Time     |
|---------|----------------|------------|----------|
| 100     | 1              | 1          | 1-2s     |
| 500     | 1              | 5          | 3-5s     |
| 1,000   | 2              | 10         | 8-12s    |
| 2,000   | 4              | 20         | 15-25s   |
| 4,000   | 8              | 40         | 30-50s   |

## GitHub Actions

The scraper runs automatically via GitHub Actions. No changes needed, but verify:

1. **Secrets are set** in GitHub:
   - `AISIS_USERNAME`
   - `AISIS_PASSWORD`
   - `DATA_INGEST_TOKEN`

2. **Workflow runs successfully**:
   - Go to **Actions** tab in GitHub
   - Check recent workflow runs
   - Verify no 504 errors in logs

## Rollback Plan

If you encounter issues and need to rollback:

1. **Revert to previous version**:
   ```bash
   git revert HEAD
   git push
   ```

2. **Undeploy Edge Functions**:
   ```bash
   # There's no direct undeploy, but you can deploy a simple version
   # Create a minimal function that returns an error
   supabase functions deploy github-data-ingest
   ```

3. **Use previous client code**:
   ```bash
   git checkout HEAD~1 -- src/supabase.js
   git commit -m "Rollback to previous sync logic"
   git push
   ```

## Success Criteria

✅ **Deployment is successful when:**

1. Edge Functions deployed without errors
2. Scraper runs for small dataset (~100 records) without timeout
3. Scraper runs for full term (~4000 records) without timeout
4. Database row count matches scraped total
5. Running scraper twice doesn't increase row count (idempotent)
6. Edge Function logs show batched processing
7. No 504 errors in GitHub Actions workflow

## Next Steps

After successful deployment:

1. **Monitor the first few scheduled runs** in GitHub Actions
2. **Check database growth** to ensure data is syncing correctly
3. **Review Edge Function logs** for any errors or warnings
4. **Set up alerts** in Supabase for failed Edge Function invocations
5. **Document any custom configurations** for your team

## Support

- Edge Functions documentation: `supabase/functions/README.md`
- Architecture details: `README.md` (Batching Architecture section)
- Supabase docs: https://supabase.com/docs/guides/functions
- GitHub Issues: https://github.com/CelestialBrain/aisis-scraper/issues
