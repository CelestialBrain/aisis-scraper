# Sanity Checks and Data Loss Prevention - Implementation Summary

## Overview

This document describes the comprehensive sanity checks and safeguards implemented to prevent data loss from AISIS misrouting or HTML quirks in the schedule scraper.

## Problem Statement

**Critical Incident**: On term 2025-1, scraping the MA (Mathematics) department returned only 13 Korean-language courses (KRN/KOR subjects) instead of the expected 300+ MATH courses. Because the scraper used `replace_existing=true` on Supabase sync, this wiped out all correct Mathematics data and replaced it with the incomplete 13-record set.

**Root Cause**: AISIS occasionally misroutes department scraping requests or returns unexpected HTML. The scraper blindly trusted AISIS responses and aggressively replaced existing data without validation.

## Solution Architecture

The implementation adds three layers of protection:

### 1. Department-Level Sanity Checks (Scraping Phase)

**Location**: `src/scraper.js`

**Function**: `performDepartmentSanityChecks(deptCode, courses, html, term)`

**Critical Departments Protected**:
- **MA (Mathematics)**: Requires >= 50 MATH-prefixed courses (configurable)
- **PE (Physical Education)**: Requires PEPC and/or PHYED courses, minimum total count
- **NSTP Departments**: Requires >= 10 NSTP-prefixed courses

**Behavior**:
- Runs automatically after parsing courses in `_scrapeDepartment()`
- Counts courses by subject prefix using `getSubjectPrefix()`
- Compares counts against configured minimums
- On failure:
  - Saves raw HTML to `logs/raw-sanity-check-failed-{term}-{dept}.html`
  - Throws error to mark department as `failed`
  - Department's courses are **excluded from sync**
  - Logs clear error message with prefix breakdown

**Configuration** (`.env`):
```bash
SCRAPER_MIN_MA_MATH=50          # Default: 50
SCRAPER_MIN_PE_COURSES=20       # Default: 20
SCRAPER_MIN_NSTP_COURSES=10     # Default: 10
DEBUG_SCRAPER=true              # Enable verbose logging
```

### 2. Per-Department Baseline Tracking (Validation Phase)

**Location**: `src/baseline.js`

**New Methods**:
- `buildDepartmentBaselineData(departmentsArray)`: Builds per-dept structure from scrape results
- `saveDepartmentBaseline(term, departmentData)`: Saves to `baseline-{term}-departments.json`
- `loadDepartmentBaseline(term)`: Loads previous per-dept baseline
- `compareWithDepartmentBaseline(term, currentDeptData)`: Detects per-dept regressions

**Baseline Structure**:
```json
{
  "term": "2025-1",
  "timestamp": "2025-12-02T10:00:00.000Z",
  "departments": {
    "MA": {
      "row_count": 305,
      "prefix_breakdown": {
        "MATH": 305
      }
    },
    "PE": {
      "row_count": 152,
      "prefix_breakdown": {
        "PEPC": 79,
        "PHYED": 73
      }
    }
  }
}
```

**Regression Detection**:
- Compares each department's `row_count` against previous baseline
- Default threshold: 50% drop (configurable via `BASELINE_DEPT_DROP_THRESHOLD`)
- Flags critical departments: MA, PE, NSTP (ADAST), NSTP (OSCI)
- Detects missing subject prefixes (e.g., PEPC disappeared from PE)
- Returns `hasCriticalRegressions: true` if any critical dept fails

**Configuration**:
```bash
BASELINE_DEPT_DROP_THRESHOLD=0.5  # 0.5 = 50% drop threshold
```

### 3. Supabase Sync Hardening (Sync Phase)

**Location**: `src/supabase.js`

**New Method**: `validateDepartmentHealth(termCode, departmentsArray, baselineManager)`

**Integration** (in `src/index.js`):
```javascript
// Before sync, run health check
const healthCheck = supabase.validateDepartmentHealth(term, deptResults, baselineManager);

// Pass health check result to sync
await supabase.syncToSupabase('schedules', allCleanCourses, term, ALL_DEPARTMENTS_LABEL, null, healthCheck);
```

**Behavior**:
- Runs **before** sending first batch to Supabase
- Builds current per-dept data and compares with baseline
- If `hasCriticalRegressions: true`:
  - **Aborts sync** with clear error message
  - `replace_existing=true` is **never sent** to Supabase
  - Existing good data in database is preserved
  - Lists which departments failed in error message

**Fallback**: If no baseline manager provided, skips regression checks (bootstrap mode)

### 4. Raw HTML Snapshotting (Debugging)

**Function**: `saveRawHtml(html, term, deptCode, reason)`

**Location**: `src/scraper.js`

**Behavior**:
- Creates `logs/` directory if needed
- Saves HTML to `logs/raw-{reason}-{term}-{dept}-{timestamp}.html`
- Called automatically when sanity checks fail
- Enables manual inspection of what AISIS actually returned

## Integration Points

### Scraping Flow
```
1. _scrapeDepartment() fetches HTML from AISIS
2. _parseCourses() extracts courses from HTML
3. performDepartmentSanityChecks() validates courses ← NEW
   - If failed: saves HTML, throws error, dept marked as failed
4. Return courses (or empty array if failed)
```

### Baseline Flow (in `src/index.js`)
```
1. Scrape all departments for term
2. Build per-department baseline data ← NEW
3. Save per-department baseline ← NEW
4. Compare with overall baseline (existing)
5. Compare with per-department baseline ← NEW
```

### Sync Flow
```
1. Before sync: Run health check ← NEW
   - Build current per-dept data
   - Compare with per-dept baseline
   - Check for critical regressions
2. If health check fails: ABORT sync ← NEW
3. If health check passes: Proceed with sync
4. First batch: replace_existing=true
5. Subsequent batches: replace_existing=false
```

## Test Coverage

### `tests/test-sanity-checks.js`
- ✅ MA department passes with good MATH data
- ✅ MA department fails with KRN/KOR data (misrouted)
- ✅ PE department passes with PEPC and PHYED courses
- ✅ Configuration respects environment variables
- ✅ Default thresholds used when env vars not set

### `tests/test-department-baseline.js`
- ✅ Build per-department baseline data from scrape results
- ✅ Save and load per-department baselines
- ✅ Detect no regression when counts are similar
- ✅ Detect regression when MA drops significantly (305 → 13)
- ✅ Detect missing subject prefixes (PEPC disappeared)
- ✅ Warn about departments that disappeared entirely
- ✅ Handle first run with no previous baseline
- ✅ Respect BASELINE_DEPT_DROP_THRESHOLD configuration

### Test Fixtures
- `tests/fixtures/ma-good-sample.html`: 8+ MATH courses (healthy)
- `tests/fixtures/ma-bad-sample.html`: 13 KRN/KOR courses (misrouted)
- `tests/fixtures/aisis-schedule-pe-mixed.html`: Mixed PEPC/PHYED (existing)

## Files Modified

### Core Implementation
- `src/scraper.js`: Added sanity check config, `performDepartmentSanityChecks()`, `saveRawHtml()`, integrated checks into `_scrapeDepartment()`
- `src/baseline.js`: Added per-department baseline methods (`buildDepartmentBaselineData`, `saveDepartmentBaseline`, `loadDepartmentBaseline`, `compareWithDepartmentBaseline`)
- `src/supabase.js`: Added `validateDepartmentHealth()`, integrated health check into `syncToSupabase()`
- `src/index.js`: Integrated per-department baseline tracking and health checks into main scraping flow

### Configuration
- `.env.example`: Added new environment variables for sanity check thresholds and per-department baseline configuration

### Tests
- `tests/test-sanity-checks.js`: Department sanity check tests (NEW)
- `tests/test-department-baseline.js`: Per-department baseline tracking tests (NEW)
- `tests/fixtures/ma-good-sample.html`: Good MA data fixture (NEW)
- `tests/fixtures/ma-bad-sample.html`: Bad MA data fixture (NEW)

### Documentation
- `README.md`: Added "Data Loss Protection" feature, new section with detailed explanation, updated environment variables table
- `SANITY_CHECKS_SUMMARY.md`: This document (NEW)

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_MIN_MA_MATH` | `50` | Minimum MATH courses required for MA department |
| `SCRAPER_MIN_PE_COURSES` | `20` | Minimum total courses required for PE department |
| `SCRAPER_MIN_NSTP_COURSES` | `10` | Minimum NSTP courses required for NSTP departments |
| `BASELINE_DEPT_DROP_THRESHOLD` | `0.5` | Per-department regression threshold (0.0-1.0) |
| `DEBUG_SCRAPER` | `false` | Enable verbose logging with prefix breakdowns |

### Baseline Files

**Overall baseline** (existing):
- Location: `logs/baselines/baseline-{term}.json`
- Tracks: Total record count, per-department record counts

**Per-department baseline** (new):
- Location: `logs/baselines/baseline-{term}-departments.json`
- Tracks: Per-department row counts and subject prefix breakdowns

**Raw HTML snapshots** (new):
- Location: `logs/raw-{reason}-{term}-{dept}-{timestamp}.html`
- Created when: Sanity checks fail
- Purpose: Manual inspection of AISIS response

## Deployment Notes

### First Deployment
1. No existing per-department baselines exist yet
2. First run will create baseline files
3. Subsequent runs will compare against these baselines
4. No regressions will be detected on first run (bootstrap mode)

### GitHub Actions Integration
The scraper already saves baselines as artifacts and restores them. The new per-department baselines will be automatically included in the `baselines` artifact.

### Rollout Strategy
1. Deploy code changes
2. Run once to establish per-department baselines
3. Monitor logs for sanity check behavior
4. Adjust thresholds if needed based on actual course counts
5. Enable strict mode if desired (abort on regression)

## Monitoring and Alerts

### Success Indicators
- ✅ "Sanity check passed" messages for critical departments
- ✅ "No significant per-department regressions detected"
- ✅ "Department health check passed"
- ✅ First batch sent with `replace_existing=true`

### Failure Indicators
- ❌ "MA sanity check failed: expected >= X MATH courses, got Y"
- ❌ "CRITICAL REGRESSION: Row count dropped by Z%"
- ❌ "Department health check failed"
- 🚫 "Will NOT use replace_existing=true to prevent data loss"
- 🚫 "SYNC ABORTED"

### Action Items on Failure
1. Check scraper logs for detailed error messages
2. Inspect `logs/raw-*.html` files to see what AISIS returned
3. Verify AISIS web UI shows expected courses
4. If AISIS issue: Wait and re-run scraper
5. If legitimate change: Adjust thresholds in environment variables

## Future Enhancements

Potential improvements for consideration:
- Add sanity checks for more departments (EC, EN, etc.)
- Implement automatic retry with different dept codes if sanity check fails
- Add Slack/email notifications on sanity check failures
- Store sanity check failure history for trend analysis
- Add per-department health score metrics
- Implement gradual rollout (warn-only mode for new departments)

## Related Documentation

- `README.md`: User-facing documentation and configuration
- `BASELINE_FIX_SUMMARY.md`: Overall baseline system documentation
- `PERFORMANCE_OPTIMIZATION.md`: Scraping performance improvements
- `SCHEDULE_SCRAPER_IMPROVEMENTS.md`: Schedule scraper design
- `docs/ingestion.md`: Supabase sync architecture
