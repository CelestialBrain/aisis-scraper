# Curriculum Version Validation - Enhancement Summary

## Overview

This enhancement strengthens the curriculum scraper's session bleed prevention by adding **version consistency validation**. Previously, the scraper only validated that the program name matched (e.g., BS MGT vs BS ME). Now it also validates that curriculum **versions** match when both the request and response contain version information.

## Problem Statement

### Observed Issue
In Google Sheets and downstream Supabase, we observed rows where:
- `deg_code` indicates a newer curriculum version: `BS MGT_2025_1`
- `program_title` contains an older version string: `"BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)"`

This "version bleed" occurs when AISIS returns HTML where the curriculum header is stale or from a previous session, even though the program type (BS MGT) is correct.

### Root Cause
The existing `isProgramMatch()` function validated program names but **not version consistency**:
- ✅ Detected: BS ME HTML returned when BS MGT was requested (different programs)
- ❌ Missed: BS MGT 2018 HTML returned when BS MGT 2025 was requested (same program, wrong version)

## Solution

### New Helper Functions

#### `extractVersionFromDegCode(degCode)`
Extracts version information from the degree code.

**Examples:**
```javascript
extractVersionFromDegCode('BS MGT_2025_1')
// → { year: 2025, sem: 1 }

extractVersionFromDegCode('AB DS_2024_2')
// → { year: 2024, sem: 2 }

extractVersionFromDegCode('BS CS')
// → { year: null, sem: null }  // No version info
```

**Implementation:**
- Splits degCode by underscore: `"BS MGT_2025_1"` → `["BS MGT", "2025", "1"]`
- Parses second part as year, third part as semester
- Returns `{ year: null, sem: null }` if parsing fails

#### `extractVersionFromProgramTitle(programTitle)`
Parses version information from the program title HTML.

**Detected Patterns:**
- `"Ver Sem 1, Ver Year 2025"` (standard AISIS format)
- `"Ver Year 2025, Ver Sem 1"` (alternate order)
- `"Ver. Sem 1, Ver. Year 2025"` (with periods)
- Embedded in longer titles: `"BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)"`

**Examples:**
```javascript
extractVersionFromProgramTitle('BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)')
// → { year: 2018, sem: 1 }

extractVersionFromProgramTitle('BS Management (Ver Year 2020, Ver Sem 1)')
// → { year: 2020, sem: 1 }

extractVersionFromProgramTitle('BS Computer Science')
// → { year: null, sem: null }  // No version info
```

**Implementation:**
- Uses regex to find `Ver Year YYYY` pattern → extracts year
- Uses regex to find `Ver Sem N` pattern → extracts semester
- Case-insensitive matching
- Returns `{ year: null, sem: null }` if no version patterns found

### Enhanced `isProgramMatch()` Function

The validation now happens in **two steps**:

#### Step 1: Version Consistency Validation (NEW)
```javascript
const degCodeVersion = extractVersionFromDegCode(degCode);
const titleVersion = extractVersionFromProgramTitle(programTitle);

// If BOTH have version info and they DISAGREE → REJECT
if (hasExpectedVersion && hasTitleVersion) {
  if (yearMismatch || semMismatch) {
    console.error('🚨 Version mismatch detected!');
    return false;  // Session bleed - reject immediately
  }
}
```

**Behavior:**
- If `degCode` has version AND `programTitle` has version:
  - Versions must match (both year and semester)
  - Mismatch → return `false` (reject as session bleed)
- If `programTitle` has NO version:
  - Continue to Step 2 (program name validation)
  - Backward compatible with curricula that don't include version in title

#### Step 2: Program Name Validation (EXISTING)
- Unchanged from original implementation
- Validates program name using multiple matching strategies
- See [CURRICULUM_SESSION_BLEED_FIX.md](CURRICULUM_SESSION_BLEED_FIX.md) for details

### Example Scenarios

#### ✅ ACCEPTED: Versions Match
```javascript
isProgramMatch(
  'BS MGT_2020_1',
  'BS Management (2020-1)',
  'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2020)'
)
// → true (year=2020 matches, sem=1 matches)
```

#### ❌ REJECTED: Year Mismatch (Session Bleed Detected)
```javascript
isProgramMatch(
  'BS MGT_2025_1',
  'BS Management (2025-1)',
  'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)'
)
// → false
// Console: 🚨 Version mismatch detected!
//          Expected: Year=2025, Sem=1 (from degCode: BS MGT_2025_1)
//          Found in title: Year=2018, Sem=1
```

#### ❌ REJECTED: Semester Mismatch
```javascript
isProgramMatch(
  'BS MGT_2025_1',
  'BS Management (2025-1)',
  'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 2, Ver Year 2025)'
)
// → false (year matches but semester differs: 1 vs 2)
```

#### ✅ ACCEPTED: No Version in Title (Backward Compatible)
```javascript
isProgramMatch(
  'BS MGT_2025_1',
  'BS Management (2025-1)',
  'BACHELOR OF SCIENCE IN MANAGEMENT'
)
// → true (no version in title, falls back to program name validation)
```

## Testing

### New Test File: `tests/test-curriculum-version-validation.js`

**Test Coverage (30 tests):**

1. **Version Extraction from degCode (6 tests)**
   - Valid patterns: `BS MGT_2025_1`, `AB DS_2024_2`
   - Edge cases: no version, empty, null

2. **Version Extraction from programTitle (7 tests)**
   - Standard format: `"Ver Sem 1, Ver Year 2018"`
   - Alternate order: `"Ver Year 2020, Ver Sem 1"`
   - With periods: `"Ver. Sem 2, Ver. Year 2025"`
   - Edge cases: no version, empty, null

3. **isProgramMatch - Matching Cases (5 tests)**
   - Exact version match (year and semester)
   - Alternate order in title
   - degCode has version, title doesn't (backward compatible)

4. **isProgramMatch - Mismatch Cases (4 tests)**
   - Year mismatch: 2025 vs 2018
   - Semester mismatch: sem 1 vs sem 2
   - Both year and semester mismatch

5. **Integration with parseCurriculumHtml (3 tests)**
   - Matching version HTML parses successfully
   - Mismatched version HTML throws error
   - No version in HTML (backward compatible)

6. **Real-World Scenario (2 tests)**
   - BS MGT 2025 degCode with 2018 title → REJECTED
   - BS MGT 2025 degCode with 2025 title → ACCEPTED

### Running Tests

```bash
# New version validation tests
node tests/test-curriculum-version-validation.js

# Original validation tests (still pass)
node tests/test-curriculum-validation.js

# All tests
npm test
```

**Results:**
- ✅ 30/30 new version validation tests pass
- ✅ 26/26 original validation tests pass
- ✅ **Total: 56/56 tests passing**

## Impact

### Before Enhancement
```
Request: BS MGT_2025_1
Response HTML: "BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)"
Validation: ✅ PASS (program name matches: BS MGT)
Result: ❌ CONTAMINATED DATA - wrong curriculum version ingested
```

### After Enhancement
```
Request: BS MGT_2025_1
Response HTML: "BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)"
Validation: ❌ FAIL (version mismatch: 2025 != 2018)
Result: ✅ REJECTED - no data ingested, mismatch logged
```

### Debug Output
When version mismatch is detected:
```
🚨 Version mismatch detected!
   Expected: Year=2025, Sem=1 (from degCode: BS MGT_2025_1)
   Found in title: Year=2018, Sem=1 (from programTitle: "...")

🚨 CRITICAL: Curriculum HTML mismatch detected!
   Requested degCode: BS MGT_2025_1
   Requested label: BS Management (2025-1)
   HTML program_title: BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)
   This indicates AISIS session bleed - refusing to parse contaminated data
```

## Backward Compatibility

✅ **Fully backward compatible** with existing behavior:

1. **Curricula without version in title:**
   - If `programTitle` has no `"Ver Year"` pattern, version check is skipped
   - Falls back to existing program name validation
   - No false rejections

2. **Existing tests:**
   - All 26 original tests still pass
   - No changes to existing test expectations

3. **Program name validation:**
   - Step 2 (program name matching) unchanged
   - Continues to detect program-level mismatches (BS ME vs BS MGT)

## Edge Cases Handled

| Case | degCode Version | Title Version | Result |
|------|----------------|---------------|---------|
| Both have version, match | 2025-1 | 2025-1 | ✅ Accept |
| Both have version, year mismatch | 2025-1 | 2018-1 | ❌ Reject |
| Both have version, sem mismatch | 2025-1 | 2025-2 | ❌ Reject |
| degCode has version, title doesn't | 2025-1 | none | ✅ Accept (backward compatible) |
| Neither has version | none | none | ✅ Accept (program name only) |
| Title has partial version (year only) | 2025-1 | 2025 (no sem) | ✅ Accept (year matches, sem not checked) |

## Files Changed

1. **`src/curriculum-parser.js`**
   - Added `extractVersionFromDegCode()` (exported for testing)
   - Added `extractVersionFromProgramTitle()` (exported for testing)
   - Enhanced `isProgramMatch()` with version validation step

2. **`tests/test-curriculum-version-validation.js`** (new file)
   - 30 comprehensive test cases
   - Tests all version extraction and validation logic

3. **`CURRICULUM_SESSION_BLEED_FIX.md`**
   - Updated validation logic documentation
   - Added version validation examples
   - Added debugging section for version mismatches
   - Updated test coverage section

4. **`CURRICULUM_VERSION_VALIDATION.md`** (this file, new)
   - Comprehensive documentation of the version validation feature

## Security & Quality

- ✅ No new dependencies added
- ✅ No security vulnerabilities introduced
- ✅ All existing tests pass (26/26)
- ✅ All new tests pass (30/30)
- ✅ Backward compatible (no breaking changes)
- ✅ Clear error messages for debugging
- ✅ Conservative validation (only rejects clear mismatches)

## Future Enhancements

Potential improvements not in scope for this PR:

1. **Auto-retry on version mismatch:**
   - Currently, version mismatches are logged and skipped
   - Could add retry logic similar to program name mismatches

2. **Version pattern learning:**
   - Track which version patterns appear most frequently
   - Adapt regex patterns if AISIS changes format

3. **Historical version tracking:**
   - Log when curricula transition from one version to another
   - Detect unexpected version rollbacks

4. **Partial version matching:**
   - Currently requires both year and semester when both are present
   - Could allow matching on year alone if semester is missing

## Conclusion

This enhancement provides:
- ✅ **Stronger validation** - Detects version-level session bleed, not just program-level
- ✅ **Clear debugging** - Version mismatch messages show exact discrepancy
- ✅ **Backward compatible** - No false rejections for curricula without version info
- ✅ **Well tested** - 30 new tests covering all scenarios
- ✅ **Production ready** - All existing tests pass, no regressions

The specific issue (BS MGT_2025_1 with Ver Year 2018) is now:
- ✅ **Detected** - Version mismatch caught by `isProgramMatch()`
- ✅ **Rejected** - `parseCurriculumHtml()` throws error, prevents parsing
- ✅ **Logged** - Clear error messages for debugging
- ✅ **Tested** - Real-world scenario covered in test suite

---

**Last Updated:** 2025-11-24  
**Status:** ✅ Complete - All tests passing (56/56)  
**Impact:** High - Prevents curriculum version contamination in production
