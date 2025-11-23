# Implementation Summary: Curriculum Versions Uniqueness & Scraper Robustness

## Overview

This PR implements Option A for curriculum_versions uniqueness and adds robustness improvements to the curriculum scraper's logging and validation handling.

## Changes Made

### 1. Database Migration (Option A)

**File**: `supabase/migrations/20250123000000_add_curriculum_versions_unique_constraint.sql`

Added a UNIQUE constraint on the `curriculum_versions` table to support idempotent upserts:

```sql
ALTER TABLE curriculum_versions
ADD CONSTRAINT curriculum_versions_program_version_unique
UNIQUE (program_id, version_year, version_sem, version_seq);
```

**Features**:
- Includes duplicate detection query to run before applying in production
- Detailed comments explaining manual resolution if duplicates exist
- Rollback instructions included
- Does NOT include `track_id` (that's Option B for later)
- Does NOT modify existing primary key or foreign keys

**Documentation**: Added `supabase/migrations/README.md` with:
- Migration details and purpose
- Step-by-step application instructions
- Rollback procedures
- Naming conventions

### 2. Scraper Validation Logging Improvements

**File**: `src/scraper.js` - `_scrapeDegreeWithValidation()` method

**Changes**:
- **First attempt** validation failures now logged as **info level** (ℹ️) instead of warning (⚠️)
- **Second and subsequent attempts** remain as warnings (⚠️)
- **Final failures** remain as errors (🚨 or ❌)
- Same retry logic and backoff strategy maintained (no functional changes)

**Before**:
```javascript
console.warn(`   ⚠️ ${errorMsg}`);
console.warn(`      Retrying after ${backoffMs}ms (AISIS session bleed suspected)...`);
```

**After**:
```javascript
const logFn = attempt === 1 ? console.log : console.warn;
const icon = attempt === 1 ? 'ℹ️' : '⚠️';
logFn(`   ${icon} ${errorMsg}`);
logFn(`      Retrying after ${backoffMs}ms (AISIS session bleed suspected)...`);
```

**Impact**: Reduces noise in logs from common first-attempt session bleed issues while maintaining visibility for persistent problems.

### 3. AISIS Error Page Detection

**File**: `src/scraper.js` - `_scrapeDegreeWithValidation()` method

**Detection**:
```javascript
const isAisisErrorPage = html.includes('Your Request Cannot Be Processed At This Time');
```

**Handling**:
- Detected **before** program validation (takes precedence)
- First attempt logged as info, subsequent as warnings
- After all retries fail with error page:
  ```javascript
  throw new Error(`AISIS_ERROR_PAGE:${degCode}`);
  ```
- Special error type allows different handling downstream

**Error Logging**:
```
❌ <degCode>: AISIS returned system error page ("Your Request Cannot Be Processed At This Time") 
   on all 3 attempts. Marking curriculum as unavailable.
```

### 4. Unavailable Curricula Handling

**Files**: `src/scraper.js` (scrapeCurriculum) and `src/index-curriculum.js`

**Sequential Scraping** (`src/scraper.js`):
```javascript
if (error.message.startsWith('AISIS_ERROR_PAGE:')) {
  allCurricula[i] = {
    degCode,
    label,
    status: 'unavailable',
    reason: 'aisis_error_page',
    error: 'AISIS returned system error page on all attempts'
  };
}
```

**Concurrent Scraping** (`src/scraper.js`):
```javascript
if (error.message.startsWith('AISIS_ERROR_PAGE:')) {
  return {
    success: false,
    globalIndex,
    isUnavailable: true,
    data: {
      degCode,
      label,
      status: 'unavailable',
      reason: 'aisis_error_page',
      error: 'AISIS returned system error page on all attempts'
    }
  };
}
```

**Filtering** (`src/index-curriculum.js`):
```javascript
const unavailableCurricula = curriculumData.filter(p => p.status === 'unavailable');
const availableCurricula = curriculumData.filter(p => p.status !== 'unavailable');

if (unavailableCurricula.length > 0) {
  console.log(`   ⚠️  ${unavailableCurricula.length} curricula marked as unavailable (AISIS error page):`);
  unavailableCurricula.forEach(p => {
    console.log(`      - ${p.degCode}: ${p.label}`);
  });
}

// Only parse available curricula
const { programs, allRows } = parseAllCurricula(availableCurricula);
```

**Result**: Unavailable curricula are:
- Clearly identified in logs
- Not parsed as valid data
- Not synced to Supabase or Google Sheets
- Properly tracked with reason

### 5. Comprehensive Testing

**File**: `tests/test-aisis-error-page.js` (new)

**Test Coverage**:
1. Normal HTML passes validation (1 attempt)
2. AISIS error page detected and throws `AISIS_ERROR_PAGE` error (3 attempts)
3. Error page in first attempt, valid HTML in second (2 attempts, success)
4. Error page detected before program validation
5. Program mismatch validation still works for non-error pages

**Results**:
```
✅ All tests passed! (8/8)
```

**Existing Tests**:
- `tests/test-parser.js`: ✅ 6/6 passed
- `tests/test-curriculum-validation.js`: ✅ 26/26 passed

## Verification

### Manual Testing Recommendations

1. **Migration Application**:
   ```sql
   -- Check for duplicates first
   SELECT program_id, version_year, version_sem, version_seq, COUNT(*) as duplicate_count
   FROM curriculum_versions
   WHERE version_year IS NOT NULL AND version_sem IS NOT NULL AND version_seq IS NOT NULL
   GROUP BY program_id, version_year, version_sem, version_seq
   HAVING COUNT(*) > 1;
   
   -- If none, apply migration
   -- Then verify
   SELECT constraint_name, constraint_type 
   FROM information_schema.table_constraints 
   WHERE table_name = 'curriculum_versions' 
     AND constraint_name = 'curriculum_versions_program_version_unique';
   ```

2. **Scraper Behavior**:
   ```bash
   # Run curriculum scraper locally
   npm run curriculum
   
   # Observe:
   # - First-attempt failures show ℹ️ (info) not ⚠️ (warning)
   # - Retries still happen with exponential backoff
   # - AISIS error pages clearly marked as unavailable
   # - Unavailable curricula not in final output
   ```

3. **Edge Function**:
   - Test upsert with same `(program_id, version_year, version_sem, version_seq)` twice
   - Should succeed without `ON CONFLICT` error
   - Second upsert should update, not duplicate

## Non-Goals (Out of Scope)

As specified in requirements, this PR does **NOT** include:

- ❌ Option B (track-aware functional unique index)
- ❌ Changes to `onConflict` clause in edge function
- ❌ Redesign of curriculum validation rules
- ❌ Changes to course parsing logic
- ❌ Changes to Google Sheets sync behavior (beyond filtering unavailable)

## Migration Notes

### Before Production Deployment

1. **Check for duplicates** using the query in the migration file
2. **Resolve any duplicates** manually if found
3. **Apply migration** using Supabase CLI or SQL Editor
4. **Verify constraint** was created successfully

### Rollback (if needed)

```sql
ALTER TABLE curriculum_versions
DROP CONSTRAINT curriculum_versions_program_version_unique;
```

## Summary

This implementation successfully:

✅ Adds database unique constraint for idempotent curriculum version upserts  
✅ Reduces log noise from first-attempt session bleed validation failures  
✅ Explicitly detects and handles AISIS system error pages  
✅ Prevents unavailable curricula from being ingested as valid data  
✅ Maintains all existing functionality and behavior  
✅ Includes comprehensive test coverage  
✅ Provides clear documentation and migration instructions  

The changes are minimal, surgical, and focused on the specific requirements while maintaining backward compatibility with existing behavior.
