# Supabase Edge Functions

This directory contains Supabase Edge Functions for the AISIS scraper project.

## Overview

The Edge Functions handle data ingestion from the AISIS scraper and sync it to the Supabase database with proper batching and error handling to prevent timeouts.

## Functions

### `github-data-ingest`

The main data ingestion endpoint that receives scraped data and syncs it to the database.

**Features:**
- ✅ Batched upsert (100 records per database transaction) to prevent 504 timeouts
- ✅ Consistent `onConflict` key for schedules: `term_code,subject_code,section,department`
- ✅ Validation of required fields before insertion
- ✅ Partial failure handling - continues processing even if some batches fail
- ✅ Detailed logging for debugging
- ✅ Handles both schedules and curriculum data

**Endpoint:** `https://YOUR_PROJECT_ID.supabase.co/functions/v1/github-data-ingest`

**Request Format:**
```json
{
  "data_type": "schedules",
  "records": [
    {
      "term_code": "2025-1",
      "subject_code": "CSCI 101",
      "section": "A",
      "department": "SOSE",
      "course_title": "Introduction to Computer Science",
      "units": 3.0,
      // ... other fields
    }
  ],
  "metadata": {
    "term_code": "2025-1",
    "department": "ALL"
  }
}
```

**Response Format (Success):**
```json
{
  "success": true,
  "inserted": 3927,
  "total": 3927,
  "errors": []
}
```

**Response Format (Partial Success):**
```json
{
  "success": false,
  "inserted": 3800,
  "total": 3927,
  "errors": ["Batch 5 failed: ...", "..."],
  "partial_success": true
}
```

## Database Schema

### aisis_schedules Table

The Edge Function expects the following table structure:

```sql
CREATE TABLE aisis_schedules (
  id BIGSERIAL PRIMARY KEY,
  term_code TEXT NOT NULL,
  department TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  section TEXT NOT NULL,
  course_title TEXT,
  units NUMERIC,
  time_pattern TEXT,
  start_time TIME,
  end_time TIME,
  days_of_week TEXT, -- JSON array as text
  room TEXT,
  instructor TEXT,
  language TEXT,
  level TEXT,
  remarks TEXT,
  max_capacity INTEGER,
  delivery_mode TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRITICAL: This unique constraint must match the onConflict key
CREATE UNIQUE INDEX unique_schedule_entry 
  ON aisis_schedules(term_code, subject_code, section, department);

CREATE INDEX idx_schedules_term_dept ON aisis_schedules(term_code, department);
CREATE INDEX idx_schedules_subject ON aisis_schedules(subject_code);
```

## Deployment

### Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link to your Supabase project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_ID
   ```

### Deploy a Function

```bash
# Deploy the github-data-ingest function
supabase functions deploy github-data-ingest

# Deploy all functions
supabase functions deploy
```

### Local Testing

```bash
# Start Supabase locally
supabase start

# Serve the function locally
supabase functions serve github-data-ingest

# Test with curl
curl -i --location --request POST 'http://localhost:54321/functions/v1/github-data-ingest' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "data_type": "schedules",
    "records": [
      {
        "term_code": "2025-1",
        "subject_code": "TEST 101",
        "section": "A",
        "department": "TEST",
        "course_title": "Test Course"
      }
    ]
  }'
```

## Architecture

### Two-Layer Batching

To prevent 504 timeouts when syncing thousands of schedule records, we implement batching at two levels:

1. **Client-Side Batching** (`src/supabase.js`):
   - Splits large datasets into configurable chunks (default: **2000 records**)
   - Sends multiple HTTP requests to the Edge Function
   - Each request stays under typical timeout limits
   - **Configurable via `SUPABASE_CLIENT_BATCH_SIZE` environment variable**

2. **Server-Side Batching** (Edge Function):
   - Further splits data into configurable batches (default: **100 records**)
   - Each batch is a separate database transaction
   - Partial failures don't block other batches
   - **Configurable via `GITHUB_INGEST_DB_BATCH_SIZE` environment variable** (range: 50-500)

### Example Flow (3783 schedules with optimized settings):

```
Client (src/supabase.js) - SUPABASE_CLIENT_BATCH_SIZE=2000
├─ Batch 1: 2000 records → Edge Function
│  ├─ DB Batch 1-20: 20 × 100 records → upsert to aisis_schedules
│
├─ Batch 2: 1783 records → Edge Function
│  └─ DB Batch 1-18: 18 × 100 records → upsert to aisis_schedules
│
Result: 2 HTTP requests, ~38 database transactions
Total time: ~5-8 minutes (vs 14-15 minutes with old 500-record batches)
```

### Previous Flow (3783 schedules with old settings):

```
Client (src/supabase.js) - CLIENT_BATCH_SIZE=500 (old)
├─ Batch 1-7: 7 × 500 records → Edge Function
│  └─ Each: 5 × 100 records → upsert
│
└─ Batch 8: 283 records → Edge Function
   └─ 3 × 100 records → upsert

Result: 8 HTTP requests, ~40 database transactions
Total time: ~14-15 minutes (high HTTP overhead)
```

## Configuration

### Client-Side Batch Size

Update the client batch size in your environment variables or `.env` file:

```bash
# Default: 2000 records per Edge Function call
SUPABASE_CLIENT_BATCH_SIZE=2000

# For larger datasets or faster networks, you can increase:
SUPABASE_CLIENT_BATCH_SIZE=5000

# For slower connections or timeout issues, decrease:
SUPABASE_CLIENT_BATCH_SIZE=1000
```

### Edge Function DB Batch Size

The Edge Function can also be tuned via environment variable in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** > **github-data-ingest** > **Settings**
3. Add environment variable:
   - Name: `GITHUB_INGEST_DB_BATCH_SIZE`
   - Value: `100` (default) or any value between 50-500

Higher values process more records per database transaction but may increase timeout risk.
Lower values are more reliable but slower.

### Edge Function URL

Update the Edge Function URL in `src/supabase.js` if using a custom Supabase project:

```javascript
// The URL is automatically constructed from SUPABASE_URL environment variable
// Default format: ${SUPABASE_URL}/functions/v1/github-data-ingest
this.url = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/github-data-ingest';
```

Replace `YOUR_PROJECT_ID` with your actual Supabase project ID.

## Monitoring

View function logs in the Supabase Dashboard:

1. Go to **Edge Functions** in your Supabase project
2. Click on `github-data-ingest`
3. View **Logs** tab for execution logs
4. Look for:
   - Batch processing logs: "Processing batch X/Y..."
   - Success logs: "Batch X completed: Y records upserted"
   - Error logs: "Batch X failed: ..."

## Troubleshooting

### 504 Gateway Timeout

If you still get 504 errors after the optimizations:

1. **Increase client batch size** in environment variables (reduces HTTP overhead):
   ```bash
   SUPABASE_CLIENT_BATCH_SIZE=3000  # Increased from default 2000
   ```

2. **Decrease Edge Function DB batch size** in Supabase dashboard (if database is slow):
   ```
   GITHUB_INGEST_DB_BATCH_SIZE=50  # Decreased from default 100
   ```

3. **Check database performance and indexes**:
   ```sql
   -- Ensure indexes exist
   EXPLAIN ANALYZE 
   SELECT * FROM aisis_schedules 
   WHERE term_code = '2025-1' AND department = 'CS';
   ```

### Configuration Not Taking Effect

If environment variable changes aren't working:

1. **Client-side** (`SUPABASE_CLIENT_BATCH_SIZE`):
   - Restart the Node.js process
   - Check `.env` file or GitHub Secrets are updated
   - Verify with: `console.log(process.env.SUPABASE_CLIENT_BATCH_SIZE)`

2. **Server-side** (`GITHUB_INGEST_DB_BATCH_SIZE`):
   - Re-deploy the Edge Function after setting the env var
   - Check Supabase dashboard > Edge Functions > Settings
   - Verify in Edge Function logs

### Duplicate Key Violations

If you see unique constraint violations:
1. Verify the `onConflict` key matches the database unique index
2. Current key: `term_code,subject_code,section,department`
3. Check the order matches the constraint definition

### Missing Records

If records are missing after sync:
1. Check the function logs for validation errors
2. Verify all records have required fields: `term_code`, `subject_code`, `section`, `department`
3. Look for partial success responses (some batches may have failed)

## Security

The Edge Function uses the Supabase service role key for database access. This key has full access to the database, so:

1. ✅ Protect the function with proper authentication
2. ✅ Use the `Authorization: Bearer` header with your ingest token
3. ✅ Never expose the service role key in client code
4. ✅ Rotate API keys regularly

## Performance

Expected performance with optimized settings (approximate):

**Supabase Sync Times:**
- 100 records: ~1-2 seconds
- 500 records: ~2-3 seconds  
- 1000 records: ~4-6 seconds
- 2000 records: ~5-8 seconds (1 Edge Function call)
- 4000 records: ~10-16 seconds (2 Edge Function calls)

**Total Workflow Times** (including AISIS scraping):
- ~3800 courses: ~5-8 minutes (vs 14-15 minutes with old batching)
  - AISIS scraping: ~2-3 minutes
  - Supabase sync: ~3-5 minutes (2 Edge Function calls)

**Performance Improvements** (v3.2):
- Client batch size increased: 500 → 2000 records
- HTTP requests reduced: 8 → 2 requests for typical dataset
- Total sync time reduced: ~60% faster (14-15min → 5-8min)
- Edge Function calls minimized while maintaining reliability

The batching approach trades some granularity for speed - fewer HTTP requests means faster total sync time while still preventing timeouts through server-side DB batching.
