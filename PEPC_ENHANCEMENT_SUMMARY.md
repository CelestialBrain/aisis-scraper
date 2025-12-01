# PEPC Course Scraping Enhancement Summary

## Problem Statement

Missing PEPC courses for term 2025-1 in the PE department. Supabase showed only 79 rows for PE in 2025-1 (all NSTP, no PEPC), but 231 rows for 2025-2 (including many PEPC courses).

## Root Cause Analysis

The issue was **upstream in the HTML parsing or data availability**:
- `isHeaderLikeRecord()` and `validateScheduleRecord()` correctly allow PEPC courses
- The problem occurs in `_parseCourses()` which either:
  - Is not seeing PEPC rows in the HTML for term 2025-1 + dept PE, OR
  - The HTML structure differs in ways the parser doesn't handle

## Solution Overview

Implemented comprehensive diagnostics and enhancements to detect and debug subject-level data loss:

### 1. Enhanced `_parseCourses` Method (src/scraper.js)

**Changes:**
- Added DEBUG_SCRAPER environment flag support for detailed logging
- Tightened DOM selector from `$('td.text02')` to `$('table.needspadding td.text02')` with fallback for compatibility
- Added extensive AISIS table structure documentation in code comments
- Enhanced logging when cell counts don't align with CELLS_PER_ROW (14)
- Added per-subject prefix aggregation after parsing
- In DEBUG mode or for critical departments (PE, NSTP), logs subject prefix breakdown (e.g., "PEPC=152, NSTP=79")

**Example output:**
```
📊 PE: Subject prefix breakdown: PEPC=0, NSTP=79, PHYED=0
```

### 2. Per-Department Subject Diagnostics in `scrapeSchedule` (src/scraper.js)

**Changes:**
- After flattening `perDeptCourses` into `allCourses`, computes per-department subject prefix breakdown
- Logs breakdown for critical departments (PE, NSTP) or when DEBUG_SCRAPER=true
- Makes it immediately obvious when subject families drop to zero

**Example output:**
```
📊 Per-Department Subject Prefix Breakdown:
   PE (term 2025-1): NSTP=79, PEPC=0, PHYED=0
   PE (term 2025-2): PEPC=152, NSTP=79, PHYED=12
```

### 3. Comprehensive Tests

**New files:**
- `tests/test-pe-subject-parsing.js` - Unit tests for PE department parsing
- `tests/fixtures/aisis-schedule-pe-mixed.html` - Realistic PE HTML fixture

**Test coverage:**
- Parsing accuracy for mixed PE courses (PEPC, NSTP, PHYED)
- Subject codes with dots (e.g., PEPC 13.03) are preserved
- Subject prefix counts match expected
- All courses pass `isHeaderLikeRecord()` and `validateScheduleRecord()` validation

**Results:**
```
✅ All tests passed (9 passed, 0 failed)
```

### 4. Enhanced Baseline Tracking (src/baseline.js)

**Changes:**
- Extended `saveBaseline()` to support optional `subjectPrefixCounts` tracking
- Added `compareSubjectPrefixes()` method to warn when subject prefixes drop to zero
- Controlled by TRACK_SUBJECT_PREFIXES environment flag

**Usage:**
```javascript
baselineManager.compareSubjectPrefixes(term, currentCounts, previousCounts);
// Warns: "PE: PEPC dropped to zero (was 152)"
```

### 5. Post-Scrape Validation Script

**New file:** `src/validate-subjects.js`

**Features:**
- Reads `data/courses.json` after scraping
- Computes per-department and per-subject-prefix counts
- Identifies missing subject families in critical departments
- Concise console output suitable for CI logs

**Usage:**
```bash
npm run validate:subjects
# Or with custom path:
node src/validate-subjects.js data/custom-courses.json
```

**Example output:**
```
📊 Per-Department Summary:
PE     ( 79 courses): NSTP=79, PEPC=0, PHYED=0

🔍 Critical Department Analysis:
⚠️  PE: PEPC courses missing (count = 0)
```

### 6. CI Integration

**Changes to `.github/workflows/scrape-institutional-data.yml`:**
- Added "Run tests" step before scraping
- Executes `npm run test:all` to validate parser behavior

**Changes to `package.json`:**
- Added `"test:all": "node tests/test-parser.js && node tests/test-pe-subject-parsing.js"`
- Added `"validate:subjects": "node src/validate-subjects.js"`

## Environment Flags

### DEBUG_SCRAPER
**Default:** `false`
**Purpose:** Enable detailed diagnostic logging during scraping
**Usage:**
```bash
DEBUG_SCRAPER=true npm start
```

**Output when enabled:**
- First N parsed courses per department with subjectCode and title
- Subject prefix breakdowns for all departments
- Raw cell diagnostics when parsing issues occur

### TRACK_SUBJECT_PREFIXES
**Default:** `false`
**Purpose:** Enable subject-prefix tracking in baselines for regression detection
**Usage:**
```bash
TRACK_SUBJECT_PREFIXES=true npm start
```

**Effect:**
- Baselines include per-department subject prefix counts
- `compareSubjectPrefixes()` detects when PEPC or other subjects drop to zero

## AISIS Table Structure Documentation

Added comprehensive comments in `_parseCourses()` documenting assumptions:

```javascript
/**
 * AISIS Schedule Table Structure Assumptions:
 * - Schedule data is in an HTML table with class 'needspadding'
 * - Each course row contains 14 cells (columns) with class 'text02'
 * - Column order: Subject Code, Section, Title, Units, Time, Room, Instructor,
 *   Max Slots, Language, Level, Free Slots, Remarks, S, P
 * - Header rows are filtered by isHeaderLikeRecord()
 * - Selector tries 'table.needspadding td.text02' first, falls back to 'td.text02'
 */
```

## Files Changed

1. **src/scraper.js**
   - Enhanced `_parseCourses()` with DEBUG logging and subject prefix tracking
   - Added per-department subject breakdown in `scrapeSchedule()`
   - Tightened DOM selector with fallback
   - Documented AISIS HTML structure assumptions

2. **src/baseline.js**
   - Extended `saveBaseline()` to support subject prefix counts
   - Added `compareSubjectPrefixes()` method
   - Added TRACK_SUBJECT_PREFIXES flag support

3. **src/validate-subjects.js** (new)
   - Post-scrape subject analysis script
   - Per-department and per-prefix reporting

4. **tests/test-pe-subject-parsing.js** (new)
   - Unit tests for PE department parsing
   - Validates PEPC/NSTP/PHYED handling

5. **tests/fixtures/aisis-schedule-pe-mixed.html** (new)
   - Realistic PE HTML fixture with mixed subjects

6. **package.json**
   - Added `test:all` script
   - Added `validate:subjects` script

7. **.github/workflows/scrape-institutional-data.yml**
   - Added test execution before scraping

## Usage Examples

### Debug a specific department
```bash
DEBUG_SCRAPER=true AISIS_DEPARTMENTS=PE npm start
```

### Enable full subject tracking
```bash
DEBUG_SCRAPER=true TRACK_SUBJECT_PREFIXES=true npm start
```

### Validate subjects after scraping
```bash
npm start
npm run validate:subjects
```

### Run tests
```bash
npm run test:all
```

## Next Steps for Investigation

With these enhancements in place, when the scraper runs for term 2025-1 + dept PE:

1. The console will show exact subject prefix counts: `PEPC=0, NSTP=79`
2. In DEBUG mode, first few parsed rows will be logged
3. If cell count misalignment occurs, sample raw cells will be shown
4. Post-scrape validation will flag missing PEPC in critical department analysis

This makes the root cause immediately visible:
- If PEPC rows are in the HTML but not parsed → parser bug
- If PEPC rows are not in the HTML at all → AISIS data availability issue

## Testing

All tests pass:
```bash
$ npm run test:all
✅ test-parser.js: 6 passed, 0 failed
✅ test-pe-subject-parsing.js: 9 passed, 0 failed
```

## Backwards Compatibility

All changes are backwards compatible:
- DEBUG_SCRAPER defaults to false (no noise in production)
- TRACK_SUBJECT_PREFIXES defaults to false (optional feature)
- DOM selector has fallback for compatibility
- Existing tests continue to pass
- No breaking changes to existing APIs or data structures
