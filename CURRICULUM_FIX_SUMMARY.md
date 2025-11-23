# Curriculum Scraping and Ingestion Pipeline Fixes

## Summary

This PR fixes issues in the AISIS curriculum scraping and ingestion pipeline, addressing:
- Database constraint violations in Supabase Edge Function
- Incorrect program titles in Google Sheets
- Missing debug instrumentation for troubleshooting

## Changes Made

### 1. Supabase Edge Function (`supabase/functions/github-data-ingest/index.ts`)

**Added curriculum version ingestion system** (317 lines added):

- **New interfaces** for structured curriculum data:
  - `CurriculumVersionPayload` - represents a curriculum version with requirement groups
  - `RequirementGroup` - represents a group of courses (e.g., "First Year, First Semester")
  - `RequirementRule` - represents individual course requirements

- **New `upsertCurriculumVersions` function** that:
  - Looks up `program_id` from program code
  - Looks up `track_id` from track name (if provided)
  - Implements proper delete-then-insert logic for `replace_existing`:
    - Uses exact key matching (program_id, version_label, track_id) per `uq_curriculum_version` constraint
    - Deletes requirement_rules for all requirement_groups in the version
    - Deletes requirement_groups for the version
    - Deletes the curriculum version itself
  - Inserts new curriculum version with all key fields
  - Inserts requirement groups and rules with proper validation
  - Uses `rule_type: 'by_course'` per database CHECK constraint (not 'explicit_courses')
  - Ensures `tag_pattern` is null when empty (with explicit trim check)
  - Adds comprehensive logging for debugging

- **New data_type handler**: Added `curriculum_version` route to main handler

**Fixed issues**:
- ✅ `requirement_rules_rule_type_check` constraint violation (changed to 'by_course')
- ✅ `uq_curriculum_version` duplicate key violation (proper delete-then-insert with exact key matching)
- ✅ "no unique or exclusion constraint matching the ON CONFLICT specification" warnings

### 2. Node Scraper (`src/index-curriculum.js`)

**Added debug instrumentation** (25 lines added):

- Creates `debug/` directory if it doesn't exist
- Dumps debug data for specific degCode (configurable via `DEBUG_DEGCODE` env var):
  - `{degCode}-raw.html` - raw HTML from AISIS
  - `{degCode}-raw.json` - full program object with metadata
  - `{degCode}-rows.json` - parsed structured rows
- Logs sample program_title from parsed rows
- Default debug degCode is `BS MGT-H_2025_1` (the problematic one mentioned in requirements)
- Added `program_title` to Supabase sync transformation for consistency

### 3. Curriculum Parser (`src/curriculum-parser.js`)

**Enhanced program title extraction** (25 lines modified):

- Added filtering to skip year-level headers (e.g., "First Year", "Second Year")
- Added filtering to skip semester headers (e.g., "First Semester")
- Documented selector priority order (specific selectors first, generic fallback last)
- Ensures each degCode gets its own correct program_title from its HTML
- Falls back to `label` if no valid header found

**Result**: Prevents cross-program contamination like BS MGT-H showing BS ME title

### 4. Tests (`test-curriculum-endpoint.js`)

**Enhanced test coverage** (24 lines added):

- Added `program_title` to sample output display
- Added validation that `program_title` is non-empty
- Added program_title uniqueness test across multiple programs
- Logs each program's program_title to verify consistency
- Warns if a program has multiple different program_title values

### 5. New Test File (`test-program-title.js`)

**Created validation test** for program_title extraction:

- Test 1: Verifies extraction from td.header06
- Test 2: Verifies fallback to label when no header found
- Test 3: Verifies consistency within a program
- All tests pass ✅

### 6. Configuration (`.gitignore`)

- Added `debug/` directory to gitignore to prevent committing debug output

## How This Fixes the Issues

### Issue 1: `requirement_rules_rule_type_check` constraint violation

**Before**: Code was using `rule_type: 'explicit_courses'`
**After**: Changed to `rule_type: 'by_course'` which is allowed by the DB CHECK constraint
**Valid values**: `by_course`, `by_tag`, `by_prefix`, `by_pattern`

### Issue 2: `uq_curriculum_version` duplicate key violation

**Before**: Incomplete delete logic that didn't match the unique constraint keys
**After**: 
- Uses exact key matching (program_id, version_label, track_id) for lookup and delete
- Deletes in correct order: requirement_rules → requirement_groups → curriculum_version
- Inserts with all key fields to match unique constraint

### Issue 3: Incorrect program titles in Google Sheets

**Before**: Potential for cross-program contamination if parser extracted wrong headers
**After**:
- Each program's HTML is parsed separately with its own program_title
- Parser filters out year/semester headers that could be mistakenly used
- Each row in `allRows` has correct `program_title` per its `deg_code`
- Google Sheets receives `allRows` directly with no additional mapping

## Testing

All tests pass:
- ✅ Existing schedule parser tests (6/6 passed)
- ✅ New program_title extraction tests (3/3 passed)
- ✅ Enhanced curriculum endpoint tests
- ✅ CodeQL security scan (0 alerts)

## Usage

### Debug Output

To enable debug output for a specific program:

```bash
DEBUG_DEGCODE="BS MGT-H_2025_1" npm run curriculum
```

This will create files in `debug/`:
- `BS_MGT-H_2025_1-raw.html` - raw HTML
- `BS_MGT-H_2025_1-raw.json` - full program object
- `BS_MGT-H_2025_1-rows.json` - parsed structured rows

### Curriculum Version Ingestion

To use the new curriculum version API, send a POST to the Edge Function:

```json
{
  "data_type": "curriculum_version",
  "records": [
    {
      "program_code": "BS-CS",
      "version_label": "2024-1",
      "version_year": 2024,
      "version_sem": 1,
      "version_seq": 1,
      "track_name": null,
      "is_active": true,
      "requirement_groups": [
        {
          "group_name": "First Year, First Semester",
          "year_level": 1,
          "semester": 1,
          "min_units": 18,
          "rules": [
            {
              "course_code": "CSCI 101",
              "course_title": "Introduction to Programming",
              "category": "M"
            }
          ]
        }
      ]
    }
  ],
  "metadata": {
    "replace_existing": true
  }
}
```

## Statistics

- **Files changed**: 5
- **Lines added**: 385
- **Lines removed**: 9
- **Net change**: +376 lines
- **Commits**: 3

## Security

- ✅ No vulnerabilities detected by CodeQL
- ✅ No secrets or credentials added
- ✅ Proper null handling and validation
- ✅ No SQL injection risks (uses Supabase client)
