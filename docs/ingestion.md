# Schedule Data Ingestion Guide

This document describes how schedule data is synced from the AISIS scraper to Supabase, including the chunking protocol, `replace_existing` semantics, and safety guarantees.

## Overview

The schedule scraper collects course data from AISIS and syncs it to Supabase via the `github-data-ingest` edge function. Due to payload size limits and the need for atomic term-level updates, the data is sent in chunks with careful coordination to prevent data loss.

## Per-Term Ingestion

Schedule data is synced **one term at a time**. Each term (e.g., `2025-1`, `2025-2`) is treated as an independent unit:

1. All courses for a term are collected
2. The data is chunked into batches (default: 2000 records per batch)
3. Batches are sent **sequentially** to Supabase
4. Only the first batch clears old data; subsequent batches append

This ensures that:
- Each term's data is complete before moving to the next
- No cross-term data contamination occurs
- Partial failures can be identified per term

## Replace Existing Semantics

The `replace_existing` flag in the metadata controls whether existing term data is cleared before inserting new records:

| Batch | `replace_existing` | Behavior |
|-------|-------------------|----------|
| First | `true` | DELETE all existing records for the term, then INSERT |
| Subsequent | `false` | INSERT/UPSERT without deleting existing data |

**Important**: The edge function is designed to receive a **single call per term** when `replace_existing: true`. Sending multiple parallel requests with `replace_existing: true` for the same term will cause a race condition where data from losing chunks is deleted.

## Chunking Protocol

When a term has more records than the batch size, the data is split into chunks:

### Chunk Metadata

Each chunk includes metadata for observability:

```json
{
  "metadata": {
    "term_code": "2025-1",
    "record_count": 2000,
    "replace_existing": true,
    "chunk_index": 0,
    "total_chunks": 2,
    "workflow_name": "AISIS – Class Schedule",
    "run_id": "12345678"
  }
}
```

- `chunk_index`: Zero-based index of this chunk (0, 1, 2, ...)
- `total_chunks`: Total number of chunks for this term

### Sequential Processing

Chunks are processed **sequentially** (not in parallel) to prevent race conditions:

```
Term 2025-1 (3886 records):
  Chunk 0/2: 2000 records, replace_existing=true  → Clears old data, inserts
  Chunk 1/2: 1886 records, replace_existing=false → Appends to existing
```

**Why sequential?**: If chunks were sent in parallel, multiple chunks would have `replace_existing=true` (each thinking it's "first"), causing them to delete each other's data.

## Baseline Artifact Handling

The scraper uses **baselines** (stored as artifacts between workflow runs) to detect data regressions. If the current run has significantly fewer records than the previous run, this may indicate a scraping or ingestion issue.

### REQUIRE_BASELINES Environment Variable

When `REQUIRE_BASELINES=true` (default for production workflows):

1. The workflow checks if the `baselines` artifact downloaded successfully
2. If missing, the job **fails immediately** before any data is sent to Supabase
3. This prevents accidental data loss from incomplete scrapes

### When Baselines May Be Missing

- **First run**: No previous baseline exists
- **Artifact expired**: Baselines are retained for 90 days
- **Previous run failed**: Failed to upload baselines

### First-Time Setup

For the first run (or after resetting baselines):

1. Trigger the workflow manually
2. Set `require_baselines` to `false` in the workflow inputs
3. After successful completion, baselines will be uploaded
4. Future runs can use `require_baselines=true` (default)

## Safety Guarantees

The current design provides these safety guarantees:

### 1. No Data Loss from Race Conditions

- Chunks are sent sequentially per term
- Only the first chunk sets `replace_existing=true`
- Subsequent chunks append without deleting

### 2. No Partial Data Ingestion

- When `REQUIRE_BASELINES=true` and baselines are missing, the job fails before ingestion
- Regression detection warns (or fails) when record counts drop significantly

### 3. Observable Chunking

- Each chunk includes `chunk_index` and `total_chunks` metadata
- The edge function can log and track chunk progress
- Failed chunks can be identified and debugged

### 4. Term Isolation

- Each term is synced independently
- A failure in one term doesn't affect other terms
- Progress is logged per term

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_CLIENT_BATCH_SIZE` | `2000` | Records per chunk |
| `REQUIRE_BASELINES` | `true` | Fail if baselines artifact is missing |
| `BASELINE_DROP_THRESHOLD` | `5.0` | Percentage drop that triggers regression warning |
| `BASELINE_WARN_ONLY` | `true` | If `false`, fail job on regression |

### Workflow Inputs

The schedule workflows accept a `require_baselines` input:

- `true` (default): Fail if baselines are missing
- `false`: Proceed without baselines (use for first run)

## Troubleshooting

### "Baselines artifact missing" Error

**Cause**: The `baselines` artifact wasn't found and `REQUIRE_BASELINES=true`.

**Solutions**:
1. Check if this is the first run → Re-run with `require_baselines=false`
2. Check previous runs for successful baseline uploads
3. Verify artifact retention hasn't expired (90 days)

### Unexpected Data Loss

**Symptoms**: Record counts dropped significantly after a run.

**Investigate**:
1. Check the workflow logs for `replace_existing` values per batch
2. Verify chunks were sent sequentially (not parallel)
3. Check for failed chunks that may have been skipped
4. Review Supabase edge function logs for errors

### Performance Considerations

The sequential chunking approach is slightly slower than parallel sending, but ensures data safety. For typical workloads (4000-8000 records per term), the difference is minimal (seconds, not minutes).

If sync time is a concern:
1. Increase `SUPABASE_CLIENT_BATCH_SIZE` to reduce the number of chunks
2. Optimize the edge function's batch processing
3. Consider batching multiple terms if edge function supports it

## Related Documentation

- [README.md](../README.md) - General project documentation
- [MULTI_BATCH_FIX_SUMMARY.md](../MULTI_BATCH_FIX_SUMMARY.md) - History of the multi-batch fix
- [Supabase Functions README](../supabase/functions/README.md) - Edge function documentation
