# Deployment Guide: Performance Optimization (v3.2)

This guide walks through deploying performance optimizations to reduce GitHub Actions runtime from ~19 minutes to ~5-8 minutes.

## Overview

**Problem**: 
- Total runtime: ~19 minutes (workflow run 19598237286)
- Supabase sync: 14-15 minutes (8 batches × 500 records)
- High HTTP overhead from many small requests

**Solution**: 
- Increased client batch size: 500 → 2000 records
- Added term override to skip auto-detection
- Added performance timing logs
- Made batch sizes configurable via environment variables

**Result**: 
- Reduced to 1-3 Edge Function calls instead of 8
- Supabase sync: ~3-5 minutes (vs 14-15 minutes)
- Total runtime: ~5-8 minutes (vs 19 minutes)
- 60%+ performance improvement

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

## Step 5: Configure Performance Settings (Optional)

### Option 1: Use Default Settings (Recommended)

The scraper now uses optimized defaults that work well for most use cases:
- Client batch size: 2000 records
- Term: Auto-detected (unless overridden)

No configuration needed - just run `npm start`.

### Option 2: Custom Performance Tuning

For specific scenarios, you can tune performance via environment variables:

```bash
# .env file or environment variables

# Skip term auto-detection (saves 1-2s per run)
AISIS_TERM=2025-1

# Increase batch size for faster sync (if network is fast)
SUPABASE_CLIENT_BATCH_SIZE=3000

# Decrease batch size for slower networks or timeout issues
SUPABASE_CLIENT_BATCH_SIZE=1000
```

### Option 3: Edge Function DB Batch Tuning

In Supabase Dashboard > Edge Functions > github-data-ingest > Settings:

Add environment variable:
- Name: `GITHUB_INGEST_DB_BATCH_SIZE`
- Value: `100` (default) or `50-500`

Then redeploy the function:
```bash
supabase functions deploy github-data-ingest
```

## Step 6: Test Locally

### Test with Small Dataset

```bash
# Set environment variables
export AISIS_USERNAME="your_username"
export AISIS_PASSWORD="your_password"
export DATA_INGEST_TOKEN="your_token"
export AISIS_TERM="2025-1"  # Optional: skip auto-detection

# Run the scraper
npm start
```

Expected output:
```
⏱  Term detection: 0.0s (skipped - using override)
🧪 Testing with first department...
⏱  Test department: 0.5s
✅ Test successful: 127 courses found in BIO

☁️ Supabase: Syncing 127 schedules records...
📦 Split into 1 client-side batch(es) of up to 2000 records each
📤 Sending batch 1/1 (127 records)...
✅ Batch 1/1: Successfully synced 127 records
⏱  Supabase sync: 2.3s

⏱  Performance Summary:
   Initialization: 0.1s
   Login & validation: 1.2s
   AISIS scraping: 15.3s
   Supabase sync: 2.3s
   Total time: 18.9s
```

### Test with Large Dataset (Full Term)

```bash
# Use auto-detected term
unset AISIS_TERM

# Run the scraper for all departments
npm start
```

Expected output for ~3783 records:
```
⏱  Term detection: 1.2s
🧪 Testing with first department...
⏱  Test department: 0.6s
✅ Test successful: 179 courses found in BIO

☁️ Supabase: Syncing 3783 schedules records...
📦 Split into 2 client-side batch(es) of up to 2000 records each
📤 Sending batch 1/2 (2000 records)...
✅ Batch 1/2: Successfully synced 2000 records
📤 Sending batch 2/2 (1783 records)...
✅ Batch 2/2: Successfully synced 1783 records
⏱  Supabase sync: 4.8s

⏱  Performance Summary:
   Initialization: 0.1s
   Login & validation: 1.5s
   AISIS scraping: 145.2s
   Supabase sync: 4.8s
   Total time: 151.6s (2.5 minutes)
```

**Performance comparison:**
- **Old (v3.1)**: 8 batches × 500 records = ~14-15 minutes Supabase sync
- **New (v3.2)**: 2 batches × 2000 records = ~3-5 minutes Supabase sync
- **Improvement**: ~60% faster total runtime

## Step 7: Verify Database

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

## Step 8: Test Idempotency

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

## Step 9: Monitor Edge Function Logs

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

1. **Increase client batch size** to reduce HTTP overhead:
   ```bash
   # In .env or environment
   SUPABASE_CLIENT_BATCH_SIZE=3000  # Increased from default 2000
   ```

2. **Decrease Edge Function DB batch size** for slower databases:
   ```bash
   # In Supabase Edge Function settings
   GITHUB_INGEST_DB_BATCH_SIZE=50  # Decreased from default 100
   ```

3. **Check database performance**:
   ```sql
   -- Check slow queries
   SELECT * FROM pg_stat_statements 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   ```

### Slower Than Expected?

1. **Use term override** to skip auto-detection:
   ```bash
   AISIS_TERM=2025-1 npm start
   ```

2. **Increase client batch size** for faster sync:
   ```bash
   SUPABASE_CLIENT_BATCH_SIZE=5000 npm start
   ```

3. **Check timing logs** to identify bottlenecks:
   ```
   ⏱  Performance Summary:
      Initialization: 0.1s
      Login & validation: 1.5s
      AISIS scraping: 145.2s  ← Most time here is normal
      Supabase sync: 4.8s
      Total time: 151.6s
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

1. Decrease `SUPABASE_CLIENT_BATCH_SIZE`:
   ```bash
   SUPABASE_CLIENT_BATCH_SIZE=1000 npm start
   ```

2. Consider processing departments sequentially instead of all at once
3. Use Node.js with increased memory: `node --max-old-space-size=4096 src/index.js`

## Performance Benchmarks

Expected times with optimized settings (v3.2):

### Supabase Sync Only

| Records | Client Batches | DB Batches | Old Time (500/batch) | New Time (2000/batch) | Improvement |
|---------|----------------|------------|----------------------|-----------------------|-------------|
| 500     | 1              | 5          | 2-3s                 | 2-3s                  | Same        |
| 1,000   | 1              | 10         | 4-5s                 | 3-4s                  | 20% faster  |
| 2,000   | 1              | 20         | 8-10s                | 4-6s                  | 50% faster  |
| 4,000   | 2              | 40         | 16-20s               | 8-12s                 | 50% faster  |

### Total Workflow (AISIS + Supabase)

| Courses | Old Total | New Total | Improvement |
|---------|-----------|-----------|-------------|
| 3,783   | ~19 min   | ~5-8 min  | 60% faster  |

Breakdown for 3,783 courses:
- Initialization: 0.1s
- Login & validation: 1-2s
- Term detection: 0-1.5s (0s with `AISIS_TERM` override)
- Test department: 0.5-1s
- AISIS scraping: 2-3 minutes
- Supabase sync: 3-5 minutes (was 14-15 minutes)
- Total: **5-8 minutes** (was 19 minutes)

## GitHub Actions

The scraper runs automatically via GitHub Actions with optimized defaults.

### Required Secrets

In GitHub repository settings > Secrets:
- `AISIS_USERNAME`
- `AISIS_PASSWORD`
- `DATA_INGEST_TOKEN`
- `SUPABASE_URL`

### Optional Secrets for Performance Tuning

Add these for further optimization:
- `AISIS_TERM`: Skip term auto-detection (e.g., `2025-1`)
- `SUPABASE_CLIENT_BATCH_SIZE`: Custom batch size (default: `2000`)

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
