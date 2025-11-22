# Google Sheets Export Guide

This guide explains how the AISIS scraper exports data to Google Sheets and how to interpret the results.

## Overview

The scraper can export schedule data to Google Sheets using the `GoogleSheetsManager` class. The export includes all departments scraped for a given term.

## Current Behavior

### Single-Department vs Multi-Department Exports

The scraper's Google Sheets integration exports **all departments** for a term into a single sheet tab:

```javascript
// In src/index.js
await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
```

Where `cleanSchedule` contains all courses from all departments for the term.

### Data Included

Each row in the exported sheet includes:

| Column | Description | Example |
|--------|-------------|---------|
| `subject_code` | Course code | `ENLL 399.7` |
| `section` | Section identifier | `SUB-B` |
| `course_title` | Full course name | `FINAL PAPER SUBMISSION (DOCTORAL)` |
| `units` | Credit units | `0` |
| `time_pattern` | Original time string from AISIS | `TBA (~)` |
| `start_time` | Parsed start time | `00:00:00` |
| `end_time` | Parsed end time | `23:59:59` |
| `days_of_week` | Days as JSON array | `[2,4]` for T-TH |
| `room` | Room assignment | `TBA` or `SEC-A201` |
| `instructor` | Faculty name | `REYES, PEDRO` |
| `department` | **Department code** | `ENLL` |
| `language` | Course language | `ENGLISH` |
| `level` | Course level | `G` (Graduate) or `U` (Undergraduate) |
| `remarks` | Additional notes | `` |
| `max_capacity` | Maximum enrollment | `5` |
| `delivery_mode` | Delivery mode (if any) | `null` |
| `term_code` | Academic term | `2025-1` |

**Important:** The `department` column allows filtering and grouping by department within the sheet.

## Filtering by Department

To view only specific departments in Google Sheets:

1. **Using Filters:**
   - Select the header row
   - Click "Data" → "Create a filter"
   - Click the filter icon on the "department" column
   - Select desired departments (e.g., `ENLL`, `ENGG`)

2. **Using Query Formulas:**
   ```
   =QUERY(Schedules!A:Q, "SELECT * WHERE K = 'ENLL'", 1)
   ```
   Where `K` is the department column.

3. **Creating Department-Specific Tabs:**
   - Create a new tab named "ENLL Only"
   - Use formula: `=QUERY(Schedules!A:Q, "SELECT * WHERE K = 'ENLL'", 1)`
   - Repeat for other departments as needed

## Verification

To verify the exported data matches what was scraped:

1. **Check row count:**
   - Count rows in sheet (excluding header)
   - Compare with `total_courses` in `logs/schedule_summary-<term>.json`
   - They should match

2. **Check for specific courses:**
   - Use Ctrl+F or Cmd+F to search for course codes
   - Example: Search for `ENLL 399.7` to verify edge cases

3. **Check department coverage:**
   - Create a pivot table with department counts
   - Compare with department row counts in summary log
   - All departments should be represented (unless they had 0 courses)

## Best Practices

### Sheet Tab Naming

Use descriptive tab names that indicate:
- What data is included (e.g., "All Schedules 2025-1")
- The term/date range
- Whether it's a filtered view

Examples:
- `Schedules` - All departments, current term (default)
- `ENLL 2025-1` - English department only
- `Graduate Courses` - Filtered by level = 'G'
- `Archive 2024-2` - Historical data

### Column Visibility

Hide columns that aren't needed for your use case:
- Hide `term_code` if viewing a single term
- Hide `delivery_mode` if mostly null
- Hide technical fields like `days_of_week` (JSON) if not using programmatically

### Data Freshness

The sheet is updated every time the scraper runs (every 6 hours by default). The data represents a **snapshot** at that time:

- Enrollments may have changed since scrape
- Courses may have been added/dropped in AISIS
- Run verification to compare sheet vs. current AISIS state

## Multi-Tab Workflows

### Option 1: Manual Department Tabs

Create separate tabs for major departments:

```
Tab: "All Schedules"    → All departments
Tab: "ENGG"            → =QUERY(All Schedules!A:Q, "SELECT * WHERE K = 'ENGG'", 1)
Tab: "ENLL"            → =QUERY(All Schedules!A:Q, "SELECT * WHERE K = 'ENLL'", 1)
Tab: "Summary"         → Pivot table with department counts
```

### Option 2: Dynamic Filtering

Use Apps Script to create dynamic filters:

```javascript
function filterByDepartment(deptCode) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var sourceRange = sheet.getRange('All Schedules!A:Q');
  var targetSheet = sheet.getSheetByName(deptCode) || sheet.insertSheet(deptCode);
  
  var filter = sourceRange.createFilter();
  filter.setColumnFilterCriteria(11, SpreadsheetApp.newFilterCriteria()
    .whenTextEqualTo(deptCode)
    .build());
}
```

### Option 3: Programmatic Export (Future Enhancement)

If you need separate sheets per department, you can:

1. Modify `src/index.js` to export per-department:
   ```javascript
   // Group courses by department
   const byDept = {};
   for (const course of cleanSchedule) {
     if (!byDept[course.department]) byDept[course.department] = [];
     byDept[course.department].push(course);
   }
   
   // Export each department to its own tab
   for (const [dept, courses] of Object.entries(byDept)) {
     await sheets.syncData(SPREADSHEET_ID, dept, courses);
   }
   ```

2. **Trade-off:** This creates 40+ tabs which may be harder to manage than filtering a single tab.

## Troubleshooting

### Sheet Not Updating

1. Check GitHub Actions logs for errors
2. Verify `GOOGLE_SERVICE_ACCOUNT` and `SPREADSHEET_ID` secrets
3. Ensure service account has edit access to the spreadsheet
4. Check Edge Function logs for sync errors

### Missing Data

1. Check `logs/schedule_summary-<term>.json` for scraping issues
2. Run verification: `npm run verify <term>`
3. Compare counts: `jq '.total_courses' logs/schedule_summary-<term>.json`
4. Check for department-specific failures in summary

### Partial Data

If some departments are missing:
1. Check summary log for `"status": "failed"` entries
2. Look for retry errors in console logs
3. Re-run scraper (idempotent, safe to re-run)
4. Check AISIS availability for those departments

### Performance Issues

If the sheet is slow with 3000+ rows:
- Consider splitting by semester/term into multiple sheets
- Use filtered views instead of creating filtered copies
- Limit visible rows using pagination in Google Sheets
- Export to CSV for local analysis of large datasets

## Example Use Cases

### Use Case 1: Department Chair Review

**Goal:** Review all ENGG courses for the term

**Steps:**
1. Open sheet, create filter on department column
2. Filter to show only `ENGG`
3. Review for completeness, conflicts, enrollment
4. Verify against AISIS using `npm run verify 2025-1 ENGG`

### Use Case 2: Cross-Department Analysis

**Goal:** Find all graduate courses with TBA time

**Steps:**
1. Use query: `=QUERY(Schedules!A:Q, "SELECT * WHERE M = 'G' AND E CONTAINS 'TBA'", 1)`
2. Review results
3. Check for edge cases (comprehensives, residency, final papers)

### Use Case 3: Enrollment Tracking

**Goal:** Track enrollment changes over time

**Steps:**
1. Export to "Schedules 2025-1 Week1" tab
2. Wait for next scrape
3. Export to "Schedules 2025-1 Week2" tab
4. Use VLOOKUP to compare free_slots between weeks

**Formula:**
```
=VLOOKUP(A2, 'Schedules 2025-1 Week2'!A:L, 11, FALSE) - K2
```
Shows enrollment change for each course.

## Future Enhancements

Potential improvements to Google Sheets integration:

1. **Multi-tab export:** Automatically create one tab per department
2. **Incremental updates:** Only update changed rows instead of full refresh
3. **Metadata tab:** Include scrape timestamp, summary statistics
4. **Formatting:** Auto-format headers, freeze rows, add filters
5. **Charts:** Auto-generate enrollment charts, department distribution
6. **Validation:** Sheet-side data validation for manual edits
7. **Change log:** Track historical changes to courses

These are not currently implemented to keep the integration simple and fast.
