# AISIS Scraper: Data Interpretation & Storage Guide for Lovable

This guide is for developers integrating the AISIS scraper's output into the Lovable platform. It details the data models, provides interpretation guidelines, and recommends best practices for storage and synchronization.

## Overview

The scraper extracts two primary institutional datasets from AISIS:
1.  **Schedule of Classes**: A complete listing of all courses offered in a given term, including schedules, instructors, and slot availability.
2.  **Official Curriculum**: The official list of required courses for every degree program.

The data is extracted, transformed into a structured format, and synced to Supabase via the `github-data-ingest` Edge Function.

---

## 1. Data Model: Schedule of Classes

This model represents a single class section available in a specific term.

### Example Scraped Data (Raw)

This is the raw data format directly from `scraper.js` before transformation:

```json
{
  "department": "ITMGT",
  "subjectCode": "ITMGT 25",
  "section": "A",
  "title": "IT INFRASTRUCTURE & NETWORK TECHNOLOGIES",
  "units": "3.0",
  "time": "T-TH 09:00-10:30",
  "room": "F302",
  "instructor": "SY, JANSEN",
  "maxSlots": "40",
  "language": "ENGLISH",
  "level": "U",
  "freeSlots": "0",
  "remarks": ""
}
```

### Transformed Data & Supabase Storage

The `supabase.js` manager transforms the raw data into a more structured format before sending it to the Supabase Edge Function. This transformed model is what Lovable's backend will receive.

**Supabase Table:** `aisis_schedules`

| Field Name | Supabase Type | Description & Interpretation | Example (Transformed) |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | Primary Key. Auto-incrementing unique identifier. | `101` |
| `term_code` | `TEXT` | **Crucial Context**. The academic term this schedule belongs to (e.g., `20253`). This is added during the sync process. | `"20253"` |
| `department` | `TEXT` | **Crucial Context**. The department offering the course. Added during scraping. | `"ITMGT"` |
| `subject_code` | `TEXT` | The unique code for the subject (e.g., `ITMGT 25`). | `"ITMGT 25"` |
| `section` | `TEXT` | The specific class section (e.g., `A`, `B`, `C1`). | `"A"` |
| `course_title` | `TEXT` | The full title of the course. | `"IT INFRASTRUCTURE..."` |
| `units` | `NUMERIC` | The number of academic units. Parsed from a string to a number. | `3.0` |
| `time_pattern` | `TEXT` | The original, human-readable time string from AISIS. Stored for reference. | `"T-TH 09:00-10:30"` |
| `start_time` | `TIME` | **Parsed**. The start time in `HH:MM:SS` format. | `"09:00:00"` |
| `end_time` | `TIME` | **Parsed**. The end time in `HH:MM:SS` format. | `"10:30:00"` |
| `days_of_week` | `INTEGER[]` | **Parsed**. An array of integers representing the days. `M=1, T=2, W=3, TH=4, F=5, S=6, SU=0`. | `{2, 4}` |
| `room` | `TEXT` | The assigned classroom or `TBA` if not yet assigned. | `"F302"` |
| `instructor` | `TEXT` | The faculty member assigned to the class. | `"SY, JANSEN"` |
| `max_capacity` | `INTEGER` | The maximum number of students allowed. Parsed from a string. | `40` |
| `remarks` | `TEXT` | Any additional notes or restrictions from the registrar. | `""` |

### Why this structure is important for Lovable:

- **Structured Time**: Parsing the `time_pattern` into `start_time`, `end_time`, and `days_of_week` is essential for calendar-based features, conflict detection, and filtering in Lovable. Storing them as native `TIME` and `INTEGER[]` types allows for efficient database queries.
- **Contextual Keys**: `term_code` and `department` are not part of the raw scraped data but are added during the process. They are **critical** for partitioning the data and ensuring that sync operations are atomic and don't corrupt data from other terms or departments.
- **Data Integrity**: Storing `units` and `max_capacity` as numeric types ensures they can be used in calculations and are not subject to string-related errors.

---

## 2. Data Model: Official Curriculum

This model represents a single course requirement within a specific degree program.

### Example Scraped Data (Raw)

```json
{
  "degree": "BS ITE",
  "yearLevel": "FIRST YEAR",
  "semester": "First Semester",
  "courseCode": "ARTAP 10",
  "description": "Art Appreciation",
  "units": "3",
  "category": "CORE"
}
```

### Transformed Data & Supabase Storage

**Supabase Table:** `aisis_curriculum`

| Field Name | Supabase Type | Description & Interpretation | Example (Transformed) |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | Primary Key. Auto-incrementing unique identifier. | `201` |
| `degree_code` | `TEXT` | The code for the degree program (e.g., `BS ITE`). | `"BS ITE"` |
| `year_level` | `TEXT` | The year level this course is intended for. This is a header from the page. | `"FIRST YEAR"` |
| `semester` | `TEXT` | The semester this course is intended for. Also a page header. | `"First Semester"` |
| `course_code` | `TEXT` | The unique code for the required course. | `"ARTAP 10"` |
| `course_description`| `TEXT` | The full title of the course. | `"Art Appreciation"` |
| `units` | `NUMERIC` | The number of academic units. Parsed from a string. | `3` |
| `category` | `TEXT` | The category of the course (e.g., `CORE`, `MAJOR`, `ELECTIVE`). | `"CORE"` |

### Why this structure is important for Lovable:

- **Program-Centric View**: This model is designed to answer the question, "What courses do I need to take for my degree?" It's structured to be easily filtered by `degree_code`.
- **Clear Progression**: `yearLevel` and `semester` provide a recommended timeline for students, which Lovable can use to build academic planners or progress trackers.
- **Normalized Data**: By storing curriculum separately from schedules, we avoid data duplication. The `course_code` acts as a foreign key reference to the `schedules` table, allowing Lovable to link a required course to its available sections in a given term.

---

## 3. Data Synchronization Logic for Lovable's Backend

The `github-data-ingest` Edge Function is the bridge between the scraper and Lovable's database. It uses upsert logic (insert or update) to keep data synchronized.

### Syncing Schedules

- **Granularity**: The scraper syncs schedule data **per department, per term**. The function will receive a payload containing all classes for one department (e.g., `ITMGT`) for one term (e.g., `20253`).
- **Current Logic (Upsert)**: The Edge Function uses upsert logic that:
  1.  **Inserts** new records that don't exist
  2.  **Updates** existing records based on matching primary keys
  3.  **Preserves** old records that aren't in the current payload
- **Payload Format**:
  ```json
  {
    "data_type": "schedules",
    "records": [...],
    "metadata": {
      "term_code": "20253",
      "department": "ITMGT"
    }
  }
  ```

### Syncing Curriculum

- **Granularity**: The scraper syncs all curriculum data for **all degree programs at once**.
- **Current Logic (Upsert)**: The Edge Function uses the same upsert logic as schedules:
  1.  **Inserts** new curriculum records
  2.  **Updates** existing records based on matching keys
  3.  **Preserves** records not in the current payload
- **Payload Format**:
  ```json
  {
    "data_type": "curriculum",
    "records": [...],
    "metadata": {}
  }
  ```


---

## 4. Data Verification & Validation Pipeline

To ensure all AISIS schedules are correctly scraped, stored, and exported, the scraper includes comprehensive verification tools and logging.

### 4.1 Scraper Summary Logs

Every scrape operation generates a summary report at `logs/schedule_summary-<term>.json` containing:

```json
{
  "term": "2025-1",
  "timestamp": "2025-11-22T18:00:00.000Z",
  "total_courses": 3927,
  "departments": {
    "ENGG": {
      "status": "success",
      "row_count": 127,
      "error": null,
      "attempts": 1
    },
    "ENLL": {
      "status": "success",
      "row_count": 45,
      "error": null,
      "attempts": 1
    }
  },
  "statistics": {
    "total_departments": 43,
    "successful": 41,
    "empty": 1,
    "failed": 1
  }
}
```

**Status values:**
- `success`: Department scraped successfully with courses found
- `success_empty`: Department scraped successfully but no courses found (may be valid for that term)
- `failed`: Department scraping failed after retries

### 4.2 Verification Script

Use `npm run verify` to compare AISIS data with Supabase:

```bash
# Verify all departments for current term
npm run verify

# Verify specific term
npm run verify 2025-1

# Verify specific department
npm run verify 2025-1 ENGG
```

The verification script:
1. Scrapes fresh data from AISIS for the specified department(s)
2. Queries Supabase for the same term+department
3. Compares `(subject_code, section)` keys
4. Reports mismatches (missing in DB, extra in DB)
5. Saves detailed reports to `logs/verification-<term>-<timestamp>.json` and `.md`

**Example output:**
```
🔍 Verifying ENLL for term 2025-1...
   📥 Scraping ENLL from AISIS...
   ✅ Found 45 courses in AISIS
   🗄️  Querying Supabase for ENLL, term 2025-1...
   ✅ Found 44 courses in Supabase
   ❌ MISMATCH: 1 course in AISIS but NOT in DB:
      - ENLL 399.7 SUB-B: FINAL PAPER SUBMISSION (DOCTORAL)
```

### 4.3 Parser Edge Case Handling

The scraper correctly handles special course types:

- **Zero-unit courses** (e.g., comprehensive exams, residency, final papers)
- **TBA time/room** courses
- **Special markers** like `(~)` for terminal doctoral courses
- **Modality markers** like `(FULLY ONLINE)` and `(FULLY ONSITE)` (removed from time field)

Run parser tests with:
```bash
npm test
```

This tests the parser against fixtures in `tests/fixtures/` including the specific edge case: ENLL 399.7 (FINAL PAPER SUBMISSION).

### 4.4 Enhanced Logging

The scraper now provides detailed logging:

**During parsing:**
- Cell count validation (warns if not multiple of 14)
- Skipped row warnings with reasons
- Invalid data detection

**During scraping:**
- Per-department row counts
- Retry attempts and backoff
- Empty department distinction (no offerings vs. potential error)

**Example:**
```
   ℹ️  ENLL: 630 cells found (expected multiple of 14). Remainder: 0 cells.
   ℹ️  ENLL: Processing 45 complete rows, 0 cells will be skipped.
   ✅ ENLL: 45 courses parsed from 630 cells (expected 630)
```

### 4.5 Database Sync Integrity

Edge Functions (`aisis-scraper`, `import-schedules`) now:

- **Log sample invalid records** when validation fails
- **Log sample failed batch records** when upsert fails
- **Track detailed error metadata** (error code, details, sample records)

This helps diagnose data loss issues by providing concrete examples of problematic records.

### 4.6 Validation Checklist

For each term scrape, verify:

1. ✅ Check `logs/schedule_summary-<term>.json`
   - All departments show `success` or `success_empty`
   - No `failed` departments (or investigate failures)

2. ✅ Run verification for critical departments:
   ```bash
   npm run verify 2025-1 ENLL
   npm run verify 2025-1 ENGG
   ```

3. ✅ Check Edge Function logs in Supabase for:
   - Validation warnings (invalid records)
   - Batch failures
   - Sample error records

4. ✅ Verify total counts match:
   ```sql
   SELECT COUNT(*) FROM aisis_schedules WHERE term_code = '2025-1';
   ```
   Compare with `total_courses` in summary log.

### 4.7 Known Limitations

- **HTML structure changes**: If AISIS changes the Schedule of Classes page HTML (e.g., adds/removes columns), the 14-cell chunk logic may need adjustment.
- **Session expiry**: Long scrapes may encounter session expiry. The scraper retries failed departments but won't re-login automatically.
- **Network issues**: Transient network errors trigger retries with backoff, but persistent issues require manual intervention.

**Monitoring recommendations:**
- Set up alerts for failed scrapes in GitHub Actions
- Periodically run verification for recent terms
- Review summary logs for unexpected empty departments
