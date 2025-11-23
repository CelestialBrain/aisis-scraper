# Curriculum Session Bleed Fix - Implementation Summary

## Problem

The AISIS curriculum scraper was intermittently ingesting incorrect curriculum HTML due to server-side session bleed and race conditions. This resulted in contaminated curriculum data in Supabase and Google Sheets, where:

- Request: `degCode=BS ME_2025_1` (Mechanical Engineering)
- Response: HTML for BS Management (Honors)
- Result: Supabase/Sheets rows with `deg_code=BS ME_2025_1` but `program_title="BS Management (Honors)"` and wrong course list

## Root Cause

AISIS J_VOFC.do endpoint maintains server-side session state for "currently selected curriculum". When requests arrive too quickly or concurrently, the server may return HTML for the wrong program.

**Contributing factors:**
- High concurrency (4 programs scraped in parallel)
- Low delays between requests (100ms)
- No validation of response vs request

## Solution

### 1. **Program Title Validation (`isProgramMatch`)**

**File:** `src/curriculum-parser.js`

**Purpose:** Validate that HTML program title matches the requested `degCode` and `label`

**Logic:**
- Normalize strings (uppercase, collapse whitespace)
- Extract base program code (e.g., "BS ME" from "BS ME_2025_1")
- Check multiple match conditions:
  - Direct label/title substring match
  - Base code in title + 40%+ word overlap
  - 70%+ word overlap (even without base code)
  - 80%+ code components found + 40%+ word overlap

**Examples:**
```javascript
isProgramMatch('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 'BS Mechanical Engineering') 
// → true

isProgramMatch('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 'BS Management (Honors)') 
// → false (MISMATCH - session bleed detected)
```

### 2. **Circuit Breaker in Parser**

**File:** `src/curriculum-parser.js` → `parseCurriculumHtml()`

**Purpose:** Refuse to parse HTML that doesn't match the requested program

**Behavior:**
```javascript
const programTitle = extractProgramTitle($) || label;

if (!isProgramMatch(degCode, label, programTitle)) {
  console.error(`🚨 CRITICAL: Curriculum HTML mismatch detected!`);
  console.error(`   Requested degCode: ${degCode}`);
  console.error(`   HTML program_title: ${programTitle}`);
  throw new Error(`Curriculum HTML mismatch for ${degCode}`);
}
// Only parse rows if validation passes
```

**Result:** Parser throws error **before** extracting any course rows, preventing contamination.

### 3. **Validation with Retry**

**File:** `src/scraper.js` → `_scrapeDegreeWithValidation()`

**Purpose:** Validate HTML at scraping time and retry on mismatch

**Behavior:**
1. Fetch HTML via `_scrapeDegree(degCode)`
2. Validate program title matches `degCode` and `label`
3. If validation fails:
   - Log warning with attempt count
   - Retry with exponential backoff (2s, 4s, 8s)
   - Maximum 3 attempts
4. If all attempts fail, throw error

**Example log:**
```
⚠️ Validation failed for BS ME_2025_1 (attempt 1/3): 
   HTML contains "BS Management (Honors)" but expected "BS Mechanical Engineering"
   Retrying after 2000ms (AISIS session bleed suspected)...
✅ BS ME_2025_1: Validation passed on attempt 2
```

### 4. **Safe Parsing in `parseAllCurricula`**

**File:** `src/curriculum-parser.js` → `parseAllCurricula()`

**Purpose:** Skip programs with mismatch errors, don't contaminate output

**Behavior:**
```javascript
try {
  const rows = parseCurriculumHtml(html, degCode, label);
  // Add to programs and allRows
} catch (error) {
  if (error.message.includes('Curriculum HTML mismatch')) {
    console.warn(`⚠️ Skipping ${degCode} due to HTML mismatch`);
    // Do NOT push any rows - prevent contamination
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

### 5. **Reduced Concurrency and Increased Delays**

**File:** `src/scraper.js` → `scrapeCurriculum()`

**Changes:**
- `defaultCurriculumConcurrency`: 4 → **1** (sequential scraping)
- `defaultCurriculumDelay`: 100ms → **2000ms** (500ms in FAST_MODE)

**Warnings:**
```javascript
if (curriculumConcurrency > 1) {
  console.warn(`⚠️ Concurrency > 1 may increase risk of AISIS session bleed`);
}
if (curriculumDelayMs < 1000) {
  console.warn(`⚠️ Low delay may increase risk of AISIS session bleed`);
}
```

## Configuration

### Production / CI (Maximum Safety)
```bash
CURRICULUM_CONCURRENCY=1
CURRICULUM_DELAY_MS=2000
```

### Development (Balanced)
```bash
CURRICULUM_CONCURRENCY=2
CURRICULUM_DELAY_MS=1000
```

### Fast Mode (Higher Risk)
```bash
FAST_MODE=true
# Sets: CURRICULUM_DELAY_MS=500, CURRICULUM_CONCURRENCY=1
```

## Debugging

### Inspect specific program:
```bash
DEBUG_DEGCODE="BS ME_2025_1" npm run curriculum
```

This creates in `debug/`:
- `BS_ME_2025_1-raw.html` - Raw HTML from AISIS
- `BS_ME_2025_1-raw.json` - Full scraped object
- `BS_ME_2025_1-rows.json` - Parsed course rows
- `BS_ME_2025_1-mismatch.html` - HTML that failed validation (if mismatch)

### Verify data integrity:
1. Check `program_title` matches `deg_code`
2. Verify course list matches expected curriculum
3. Ensure no contamination from other programs

## Testing

### Run validation tests:
```bash
node tests/test-curriculum-validation.js
```

**Test coverage:**
- 26 test cases covering:
  - `isProgramMatch` with various scenarios
  - `parseCurriculumHtml` circuit breaker
  - `parseAllCurricula` error handling
  - Edge cases (null HTML, empty HTML)
  - Real-world session bleed scenarios

### Run existing tests:
```bash
npm test
node tests/test-validation.js
```

## Monitoring

### Success indicators:
```
✅ BS ME_2025_1: 15234 characters HTML, 8456 characters text
✅ Parsed 45 programs into 2341 course rows
```

### Warning signs:
```
⚠️ Validation failed for BS ME_2025_1 (attempt 1/3)
⚠️ Skipping BS ME_2025_1 due to HTML mismatch
```

### Metrics to track:
- Validation failures per scrape
- Programs skipped due to mismatch
- Retry success rate
- Total programs scraped vs. available

**Action threshold:** If validation failures exceed 10% of programs:
1. Increase `CURRICULUM_DELAY_MS` to 3000-5000ms
2. Ensure `CURRICULUM_CONCURRENCY=1`
3. Run scraper during low-traffic hours
4. Contact AISIS administrators

## Impact

### Before:
- ❌ Contaminated data in Supabase/Sheets
- ❌ Silent failures (wrong data persisted)
- ❌ No validation of response vs request
- ❌ High concurrency (4 parallel) + low delay (100ms)

### After:
- ✅ Validated data (mismatches rejected)
- ✅ Retry logic resolves most session bleeds
- ✅ Failed validations logged clearly
- ✅ Safe defaults (sequential, 2s delay)
- ✅ Contaminated programs excluded from output
- ✅ Debug tools for inspection

## Files Changed

1. **src/curriculum-parser.js**
   - Added `isProgramMatch()` validation function
   - Added circuit breaker in `parseCurriculumHtml()`
   - Added error handling in `parseAllCurricula()`
   - Made `extractProgramTitle()` exportable

2. **src/scraper.js**
   - Added `_scrapeDegreeWithValidation()` wrapper
   - Changed default concurrency from 4 to 1
   - Changed default delay from 100ms to 2000ms
   - Added warnings for risky settings
   - Updated both sequential and concurrent scraping paths

3. **src/index-curriculum.js**
   - Enhanced debug instrumentation
   - Dump mismatch HTML when detected

4. **docs/CURRICULUM_LIMITATION.md**
   - Added session bleed documentation section
   - Documented validation mechanism
   - Provided safe configuration guidelines
   - Added monitoring and debugging instructions

5. **tests/test-curriculum-validation.js** (new)
   - 26 comprehensive test cases
   - All passing

## Security

- ✅ No security vulnerabilities detected (CodeQL scan clean)
- ✅ No hardcoded credentials or secrets
- ✅ Input validation added (HTML vs request)
- ✅ Safe error handling (no data leakage)

## Backward Compatibility

- ✅ API signatures unchanged
- ✅ Environment variable overrides still work
- ✅ Existing tests still pass
- ✅ Debug mode enhanced, not changed

## Next Steps

1. **Monitor in production:**
   - Track validation failure rate
   - Adjust delays/concurrency if needed

2. **Potential improvements:**
   - Add metrics dashboard for session bleed detection
   - Implement smarter retry strategies
   - Consider requesting AISIS API access

3. **Documentation:**
   - Update README with new configuration recommendations
   - Add troubleshooting guide for session bleed

---

**Last Updated:** 2025-11-23  
**Status:** ✅ Complete - All tests passing, security scan clean  
**Impact:** High - Prevents data contamination in production
