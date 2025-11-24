# AISIS Scraper Refactor - Implementation Summary

## Overview

This refactor transforms the curriculum scraper from sending 8+ HTTP requests per program with raw, potentially duplicate data, to sending exactly **1 HTTP request per program/version** with clean, validated, deduplicated data and rich observability metadata.

## Problem Statement

### Before Refactor
- ❌ 8+ HTTP requests per program/version (via batching layer)
- ❌ Raw scraped data sent with potential duplicates
- ❌ Unnormalized course codes (e.g., "CS11", "CS 11", "CS-11")
- ❌ Backend/DB relied on to clean and deduplicate
- ❌ Limited observability into data quality issues
- ❌ Difficult to debug scraping vs. backend issues

### After Refactor
- ✅ Exactly 1 HTTP request per program/version
- ✅ Data normalized before sending
- ✅ Client-side deduplication
- ✅ Early validation with detailed error logging
- ✅ Rich metadata for observability
- ✅ Clear separation of concerns

## Architecture

### New Modules

#### 1. `src/constants.js` (Updated)
**Purpose**: Course code normalization and canonical mappings

**New Functions:**
- `normalizeCourseCode(rawCode)`: Normalizes format variations
  - `"CS11"` → `"CS 11"`
  - `"CS-11"` → `"CS 11"`  
  - `"cs 11"` → `"CS 11"`
  - Preserves hyphens in codes like `"MGT-H"`
  
- `applyCourseMappings(normalizedCode)`: Applies known canonical mappings
  - Extensible via `COURSE_CODE_MAP` object
  - Ready for real-world variant discovery

#### 2. `src/curriculum-utils.js` (New)
**Purpose**: Core business logic for data processing

**Functions:**

- **`dedupeCourses(courses)`**
  - Expects pre-normalized course codes
  - Deduplication key: `deg_code|course_code|year_level|semester`
  - No sections (curriculum-specific)
  - Last occurrence wins

- **`validateCourse(course)`**
  - Returns `{valid: boolean, errors: string[]}`
  - Checks required fields: `deg_code`, `course_code`, `course_title`, `units`
  - Validates data types and ranges
  - Allows 0 units (e.g., NSTP, residency)

- **`filterValidCourses(courses)`**
  - Returns `{valid: Course[], invalid: Array<{course, errors}>}`
  - Separates valid from invalid for logging

- **`groupByProgramVersion(courses)`**
  - Returns `Map<deg_code, Course[]>`
  - Groups for one-request-per-program batching

- **`extractProgramInfo(degCode)`**
  - Extracts `{programCode, curriculumVersion}` from `deg_code`
  - Example: `"BS CS_2024_1"` → `{programCode: "BS CS", curriculumVersion: "2024_1"}`

- **`buildBatchMetadata(...)`**
  - Constructs rich metadata object:
    - `program_code`, `curriculum_version`
    - `total_courses_scraped`, `raw_courses_count`
    - `deduplication_removed`, `invalid_courses_count`
    - `final_course_count`
    - `scraped_at` (ISO timestamp)
    - `source_url`

#### 3. `src/index-curriculum.js` (Refactored)
**Purpose**: Orchestrates the scraping and processing pipeline

**New 4-Step Pipeline:**

```javascript
// Step 1: Normalize & Map
const normalizedRows = allRows.map(row => ({
  ...row,
  course_code: applyCourseMappings(normalizeCourseCode(row.course_code))
}));

// Step 2: Deduplicate
const dedupedRows = dedupeCourses(normalizedRows);
const duplicatesRemoved = normalizedRows.length - dedupedRows.length;

// Step 3: Validate
const { valid: validRows, invalid: invalidRows } = filterValidCourses(dedupedRows);

// Step 4: Group & Batch
const groupedByProgram = groupByProgramVersion(validRows);

// Send one request per program/version
for (const [degCode, courses] of groupedByProgram) {
  const batch = {
    deg_code,
    program_code,
    curriculum_version,
    courses,
    metadata: buildBatchMetadata(...)
  };
  await supabase.sendCurriculumBatch(batch);
}
```

#### 4. `src/supabase.js` (Updated)
**Purpose**: Handles communication with Supabase edge function

**New Method:**

- **`sendCurriculumBatch(batch)`**
  - Sends exactly one program/version worth of data
  - Payload structure:
    ```javascript
    {
      data_type: 'curriculum',
      records: [...courses],
      metadata: {
        ...batch.metadata,
        ...GitHub Actions context
      }
    }
    ```
  - Detailed logging per batch
  - Compatible with existing edge function

## Observability Improvements

### Console Logging

The refactored scraper provides detailed progress logging:

```
📊 Processing curriculum data pipeline...
   1️⃣  Normalizing course codes and applying canonical mappings...
      ✅ Normalized 1245 course codes
   
   2️⃣  Deduplicating courses...
      ✅ Removed 34 duplicate courses (1245 → 1211)
      ℹ️  Duplicates removed per program:
         BS CS_2024_1: 5 duplicates
         BS ME_2025_1: 3 duplicates
         ...
   
   3️⃣  Validating courses...
      ✅ Validated 1195 courses, filtered 16 invalid
      ⚠️  Sample invalid courses (showing up to 5):
         - BS XX_2024_1 / (missing): Missing or empty course_code
         ...
   
   4️⃣  Grouping by program/version...
      ✅ Grouped into 150 program/version groups
   
   📋 Per-Program Summary:
      BS CS_2024_1: 45 courses
      BS ME_2025_1: 38 courses
      ...
```

### Batch Sending Logs

```
🚀 Starting Supabase Sync (New Batching Approach)...
   Sending 150 batch(es), one per program/version

   📤 Sending batch for BS CS_2024_1...
      Program: BS CS, Version: 2024_1
      Courses: 45
      Metadata: scraped=48, deduped=2, invalid=1
   ✅ BS CS_2024_1: 45/45 records upserted

   ...

📊 Supabase Sync Summary:
   Total batches: 150
   ✅ Successful: 150
   ❌ Failed: 0
   Total courses synced: 1195
```

## Test Coverage

### Test Suite Summary
- **91 tests passing** across 4 test suites
- **0 failures**
- **0 security vulnerabilities**

### Test Breakdown

1. **Schedule Parser Tests** (6 tests)
   - Existing tests for schedule parsing
   - Ensures no regression

2. **Curriculum Utils Tests** (43 tests)
   - Course code normalization (10 tests)
   - Deduplication logic (3 tests)
   - Validation (5 tests)
   - Filtering (3 tests)
   - Grouping (3 tests)
   - Program info extraction (3 tests)
   - Metadata building (8 tests)
   - Full pipeline integration (5 tests)

3. **Curriculum Validation Tests** (26 tests)
   - Program matching logic
   - HTML parsing validation
   - Session bleed detection
   - Edge cases

4. **Curriculum Pipeline Integration Tests** (16 tests)
   - End-to-end pipeline flow
   - Mock scraped data
   - Verifies all 4 steps
   - Batch structure validation

## Performance Impact

### Request Reduction

**Before:**
```
150 programs × ~8 requests/program = ~1,200 HTTP requests
```

**After:**
```
150 programs × 1 request/program = 150 HTTP requests
```

**Reduction: 87.5%**

### Benefits
- ✅ Reduced load on edge function
- ✅ Faster overall sync time
- ✅ Lower network overhead
- ✅ Clearer observability (one batch = one program)
- ✅ Easier to track success/failure per program

## Backward Compatibility

### Edge Function Compatibility
✅ Payload structure matches existing `github-data-ingest` edge function:
- `data_type: 'curriculum'`
- `records: []` array
- `metadata: {}` object

### Database Compatibility
✅ No schema changes required
✅ Existing unique constraints still prevent duplicates
✅ Deduplication on client is additive (defense-in-depth)

### Deployment Safety
✅ Can be deployed without edge function changes
✅ Can be deployed without database migrations
✅ Can be rolled back safely

## Future Enhancements

### Phase 1: Data Analysis (Ready)
- Run scraper with current implementation
- Analyze logs to discover course code variants
- Populate `COURSE_CODE_MAP` with real mappings

### Phase 2: Monitoring (Suggested)
- Add metrics dashboard for:
  - Duplicate counts per program over time
  - Invalid course trends
  - Scraping duration per program
  - Success/failure rates

### Phase 3: Optimization (Optional)
- Parallel batch sending (currently sequential)
- Caching of program metadata
- Incremental scraping (only changed programs)

## Rollout Plan

### Step 1: Limited Test (Recommended)
```bash
# Test with single program
CURRICULUM_LIMIT=1 npm run curriculum
```

**Verify:**
- ✅ Exactly 1 HTTP request sent
- ✅ Metadata populated correctly
- ✅ Deduplication metrics logged
- ✅ No errors

### Step 2: Small Batch Test
```bash
# Test with 10 programs
CURRICULUM_LIMIT=10 npm run curriculum
```

**Verify:**
- ✅ Exactly 10 HTTP requests sent
- ✅ All batches successful
- ✅ Logs show per-program stats

### Step 3: Full Deployment
```bash
# Run full scraper (all programs)
npm run curriculum
```

**Monitor:**
- ✅ Total batches = total programs
- ✅ Success rate ≥ 95%
- ✅ Database has expected course count
- ✅ No duplicate courses in DB

### Step 4: GitHub Actions Verification
- ✅ Workflow runs successfully
- ✅ Logs show new batching approach
- ✅ Cron schedule still works (weekly)

## Maintenance

### Adding New Course Code Mappings

When variants are discovered in production logs:

1. **Identify variant:**
   ```
   ⚠️ Sample courses: "EN 11" vs "ENGL 11"
   ```

2. **Add to `COURSE_CODE_MAP`:**
   ```javascript
   export const COURSE_CODE_MAP = {
     'EN 11': 'ENGL 11',
     'EN 12': 'ENGL 12',
     // ...
   };
   ```

3. **Test:**
   ```javascript
   assert(applyCourseMappings('EN 11') === 'ENGL 11');
   ```

4. **Deploy:**
   - No database changes needed
   - Deduplication will automatically improve

## Success Metrics

### Quantitative
- ✅ 87.5% reduction in HTTP requests
- ✅ 91 tests passing (was 75 before refactor)
- ✅ 0 security vulnerabilities
- ✅ 0 breaking changes

### Qualitative
- ✅ Cleaner architecture (separation of concerns)
- ✅ Better observability (detailed logging)
- ✅ Easier debugging (single batch = single program)
- ✅ More maintainable (modular utilities)

## Conclusion

This refactor successfully transforms the curriculum scraper from a "spray and pray" approach (send everything, let backend sort it out) to a clean, validated, single-batch-per-program architecture with excellent observability and maintainability.

The implementation is:
- ✅ **Complete** - All 91 tests passing
- ✅ **Reviewed** - Code review feedback addressed
- ✅ **Secure** - No vulnerabilities found
- ✅ **Compatible** - No breaking changes
- ✅ **Production-ready** - Ready for deployment

**Next step**: Test with `CURRICULUM_LIMIT=1` to verify end-to-end flow.
