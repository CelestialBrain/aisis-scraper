# term_code Implementation - Before and After

## Problem
The `github-data-ingest` function was rejecting ALL scraped records because they lacked the required `term_code` field.

**Result**: 0 records inserted, 4153 errors (100% failure rate)

---

## BEFORE: Record Structure (Missing term_code)

### Raw Scraper Output
```json
{
  "department": "BIO",
  "subjectCode": "BIO 10.01",
  "section": "NSLEC-D-A",
  "title": "BIODIVERSITY: LIFE ON EARTH, LECTURE",
  "units": "3",
  "time": "M-TH 0800-0930",
  "room": "SEC-B305A",
  "instructor": "GATCHALIAN, Pamela",
  "maxSlots": "30",
  "language": "ENG",
  "level": "U",
  "freeSlots": "0",
  "remarks": "-"
  // ❌ NO term_code field!
}
```

### After Transformation (Still Missing term_code)
```json
{
  "subject_code": "BIO 10.01",
  "section": "NSLEC-D-A",
  "course_title": "BIODIVERSITY: LIFE ON EARTH, LECTURE",
  "units": 3,
  "time_pattern": "M-TH 0800-0930",
  "room": "SEC-B305A",
  "instructor": "GATCHALIAN, Pamela",
  "department": "BIO",
  "language": "ENG",
  "level": "U",
  "remarks": "-",
  "max_capacity": 30,
  "start_time": "00:00:00",
  "end_time": "23:59:59",
  "days_of_week": "[]",
  "delivery_mode": null
  // ❌ NO term_code field!
}
```

### Ingestion Payload
```json
{
  "data_type": "schedules",
  "metadata": {
    "term_code": "2025-1",  // ✅ Only in metadata
    "department": "ALL"
  },
  "records": [
    {
      "subject_code": "BIO 10.01",
      // ... other fields ...
      // ❌ NO term_code in individual records!
    }
  ]
}
```

**Validator Error**: `"Missing required field: term_code"` × 4153

---

## AFTER: Record Structure (With term_code)

### Raw Scraper Output → Enriched
```json
{
  "department": "BIO",
  "subjectCode": "BIO 10.01",
  "section": "NSLEC-D-A",
  "title": "BIODIVERSITY: LIFE ON EARTH, LECTURE",
  "units": "3",
  "time": "M-TH 0800-0930",
  "room": "SEC-B305A",
  "instructor": "GATCHALIAN, Pamela",
  "maxSlots": "30",
  "language": "ENG",
  "level": "U",
  "freeSlots": "0",
  "remarks": "-",
  "term_code": "2025-1"  // ✅ Added immediately after scraping
}
```

### After Transformation (Preserving term_code)
```json
{
  "subject_code": "BIO 10.01",
  "section": "NSLEC-D-A",
  "course_title": "BIODIVERSITY: LIFE ON EARTH, LECTURE",
  "units": 3,
  "time_pattern": "M-TH 0800-0930",
  "room": "SEC-B305A",
  "instructor": "GATCHALIAN, Pamela",
  "department": "BIO",
  "language": "ENG",
  "level": "U",
  "remarks": "-",
  "max_capacity": 30,
  "start_time": "00:00:00",
  "end_time": "23:59:59",
  "days_of_week": "[]",
  "delivery_mode": null,
  "term_code": "2025-1"  // ✅ Preserved through transformation
}
```

### Ingestion Payload
```json
{
  "data_type": "schedules",
  "metadata": {
    "term_code": "2025-1",  // ✅ In metadata
    "department": "ALL"
  },
  "records": [
    {
      "subject_code": "BIO 10.01",
      // ... other fields ...
      "term_code": "2025-1"  // ✅ Also in EACH record!
    }
  ]
}
```

**Expected Result**: Records will pass validation and be inserted successfully

---

## Implementation Flow

```
1. Scraper detects term: "2025-1" (from APPLICABLE_PERIOD or auto-detect)
   └─> Stored in scraper.lastUsedTerm

2. Scraper returns raw course data (without term_code)

3. ✨ NEW: src/index.js enriches each record
   const enrichedSchedule = scheduleData.map(course => ({
     ...course,
     term_code: usedTerm  // <-- ADD term_code here
   }));

4. ✨ UPDATED: src/supabase.js transformation preserves term_code
   return {
     subject_code: item.subjectCode,
     // ... other fields ...
     term_code: item.term_code  // <-- PRESERVE term_code here
   };

5. ✨ DEFENSIVE: src/supabase.js normalizes before sending
   const normalizedData = data.map(record => {
     if (dataType === 'schedules' && termCode && !record.term_code) {
       return { ...record, term_code: termCode };  // <-- BACKFILL if missing
     }
     return record;
   });

6. Records sent to github-data-ingest with term_code in each record ✅
```

---

## Validation

All changes have been tested and verified:
- ✅ Unit tests pass (src/test-term-code.js)
- ✅ Integration tests pass (src/test-integration.js)
- ✅ Code review completed
- ✅ CodeQL security scan: 0 vulnerabilities

---

## Expected Impact

**Before**: `0 records inserted, 4153 errors` (0% success rate)
**After**: `4153 records inserted, 0 errors` (100% success rate) ✅

The Scraping Operations Monitor will now show:
- ✅ Non-zero records processed
- ✅ Non-zero success rate
- ✅ Valid term_code on all records
