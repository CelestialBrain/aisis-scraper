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
   - Splits large datasets into 500-record chunks
   - Sends multiple HTTP requests to the Edge Function
   - Each request stays under typical timeout limits

2. **Server-Side Batching** (Edge Function):
   - Further splits data into 100-record batches
   - Each batch is a separate database transaction
   - Partial failures don't block other batches

### Example Flow (3927 schedules):

```
Client (src/supabase.js)
├─ Batch 1: 500 records → Edge Function
│  ├─ DB Batch 1: 100 records → upsert to aisis_schedules
│  ├─ DB Batch 2: 100 records → upsert to aisis_schedules
│  ├─ DB Batch 3: 100 records → upsert to aisis_schedules
│  ├─ DB Batch 4: 100 records → upsert to aisis_schedules
│  └─ DB Batch 5: 100 records → upsert to aisis_schedules
│
├─ Batch 2: 500 records → Edge Function
│  └─ ... (5 more DB batches)
│
├─ ... (6 more client batches)
│
└─ Batch 8: 427 records → Edge Function
   └─ ... (5 DB batches)
```

## Configuration

Update the Edge Function URL in `src/supabase.js`:

```javascript
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

If you still get 504 errors:
1. Reduce `CLIENT_BATCH_SIZE` in `src/supabase.js` (currently 500)
2. Reduce `BATCH_SIZE` in the Edge Function (currently 100)
3. Check database performance and indexes

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

Expected performance (approximate):
- 100 records: ~1-2 seconds
- 500 records: ~3-5 seconds
- 1000 records: ~8-12 seconds
- 4000 records: ~30-50 seconds (with batching)

The batching approach trades speed for reliability - it's slower than a single transaction, but it prevents timeouts and provides better error handling.
