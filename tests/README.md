# AISIS Scraper Tests

This directory contains tests for the AISIS scraper, focusing on edge cases, validation, and data completeness.

## Test Structure

```
tests/
├── fixtures/                    # HTML fixtures from AISIS
│   └── aisis-schedule-edge-cases.html
├── test-parser.js              # Parser unit tests
├── test-validation.js          # Validation utility tests
└── test-transformation.js      # Transformation validation tests
```

## Running Tests

```bash
# Run all tests (runs parser tests)
npm test

# Run specific tests
node tests/test-parser.js
node tests/test-validation.js
node tests/test-transformation.js
```

## Test Coverage

### Parser Tests (`test-parser.js`)

Tests the `_parseCourses` method with edge cases:

1. **Normal courses** - Standard lecture courses with regular schedules
2. **Zero-unit courses** - Comprehensive exams, residency, final papers (units = 0)
3. **TBA courses** - Courses with TBA time and room
4. **Special markers** - Courses with `(~)` marker for terminal doctoral courses
5. **Modality markers** - Courses with `(FULLY ONLINE)` or `(FULLY ONSITE)` markers

**Specific edge cases tested:**
- `ENLL 399.7 SUB-B` - Final Paper Submission (the specific case from the problem statement)
- `ENLL 399.6 SUB-A` - Comprehensive Exam
- `ENLL 399.5 SUB-C` - Residency
- Courses with modality markers that should be stripped

### Validation Tests (`test-validation.js`) **NEW**

Tests validation utilities from `src/constants.js`:

1. **Header detection** - Identifies table header rows
2. **Field validation** - Validates required fields
3. **Format compatibility** - Supports both raw and transformed formats

**Test cases:**
- Valid course records (should pass validation)
- Header rows with "SUBJECT CODE", "SECTION", etc. (should be detected)
- Empty records (should be detected as headers and invalid)
- Missing required fields (should fail validation)
- Raw format records (subjectCode vs subject_code compatibility)
- Special courses (doctoral courses with special characters)

### Transformation Tests (`test-transformation.js`) **NEW**

Tests transformation and validation in `src/supabase.js`:

1. **Header filtering** - Filters out header/placeholder rows
2. **Invalid record filtering** - Filters records missing required fields
3. **Valid record preservation** - Ensures valid records pass through
4. **Logging verification** - Confirms proper logging of filtered records

**Test data:**
- 2 valid records (should pass through)
- 1 header record (should be filtered)
- 1 invalid record with missing term_code (should be filtered)

**Expected output:**
- 2 records after transformation
- All output records have required fields
- Filtered records logged with samples

### Expected Test Results

```
# Parser tests
📊 Test Results:
   Total: 6
   ✅ Passed: 6
   ❌ Failed: 0

# Validation tests
📊 Test Summary:
   Total tests: 7
   ✅ Passed: 7
   ❌ Failed: 0

# Transformation tests
✅ Transformation test PASSED!
   Expected 2 records, got 2
✅ All output records have required fields
```

All tests should pass. If tests fail, it may indicate:
- AISIS HTML structure has changed
- Parser logic needs updating
- Validation logic has bugs
- Test fixtures need updating

## Adding New Tests

### 1. Create a Fixture

Save actual AISIS HTML to `fixtures/`:

```bash
# Manually save HTML from AISIS Schedule of Classes page
# Name it descriptively: aisis-schedule-<department>-<case>.html
```

**Important:** Sanitize HTML before committing:
- Remove sensitive instructor information if needed
- Keep structure intact (all `<td class="text02">` cells)
- Preserve edge cases (TBA, zero-unit, special markers)

### 2. Add Test Case

Edit `test-parser.js`:

```javascript
const expected = [
  // ... existing cases
  {
    subjectCode: 'NEW 101',
    section: 'A',
    title: 'NEW COURSE',
    units: '3.0',
    time: 'MWF 10:00-11:00',
    room: 'SEC-101'
  }
];
```

### 3. Run Test

```bash
npm test
```

## Integration Tests

For full integration testing (scraping + DB + sheets):

```bash
# Set environment variables first
export AISIS_USERNAME="your_username"
export AISIS_PASSWORD="your_password"
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# Run verification script (integration test)
npm run verify 2025-1 BIO
```

This scrapes BIO department, compares with DB, and reports mismatches.

## Test Fixtures Maintenance

### When to Update Fixtures

Update fixtures when:
- AISIS HTML structure changes
- New edge cases are discovered
- Parser is modified to handle new scenarios

### How to Update Fixtures

1. Access AISIS Schedule of Classes page
2. Select a department with edge cases (e.g., ENLL for doctoral courses)
3. Save page HTML (Ctrl+S or Cmd+S)
4. Extract relevant `<table>` section with course data
5. Minimize to essential rows for testing
6. Commit updated fixture

### Fixture Best Practices

- **Minimal:** Include only rows needed for test cases
- **Representative:** Cover all edge cases (0-unit, TBA, special markers)
- **Realistic:** Use actual AISIS HTML structure
- **Sanitized:** Remove sensitive data if needed
- **Documented:** Comment each test case in fixture HTML

## Continuous Integration

Tests run automatically in GitHub Actions on:
- Every push to main/PR branches
- Before deployment
- On schedule (weekly)

See `.github/workflows/test.yml` for CI configuration (if exists).

## Known Test Limitations

- **No live scraping tests:** Tests use fixtures, not live AISIS
- **No auth testing:** Parser tests don't require login
- **No concurrency testing:** Tests run sequentially
- **No performance testing:** Tests focus on correctness, not speed

For comprehensive testing, use:
- Verification script (`npm run verify`) for live data validation
- Manual testing in development environment
- Monitoring of production scrapes via summary logs

## Debugging Test Failures

### Parser Test Failures

If `test-parser.js` fails:

1. **Check error message:**
   ```
   ❌ Test 3 (ENLL 399.7 SUB-B): time
      Expected: "TBA (~)"
      Actual:   "TBA"
   ```

2. **Inspect fixture:**
   - Open `fixtures/aisis-schedule-edge-cases.html`
   - Verify HTML structure matches AISIS
   - Check that `<td class="text02">` cells are correct

3. **Check parser logic:**
   - Open `src/scraper.js`
   - Review `_parseCourses` method
   - Verify 14-cell chunk logic
   - Check field extraction (especially time field)

4. **Update parser or test:**
   - If AISIS changed: Update parser
   - If test is wrong: Update expected values
   - If fixture is outdated: Update fixture

### Common Issues

**Issue:** Test expects `(~)` but parser strips it
- **Cause:** Parser regex removes `~`
- **Fix:** Update parser to preserve `(~)` for special courses

**Issue:** Test fails on cell count
- **Cause:** Fixture has incomplete rows
- **Fix:** Ensure each course has exactly 14 `<td class="text02">` cells

**Issue:** All tests fail with "Cannot find module"
- **Cause:** Dependencies not installed
- **Fix:** Run `npm install`

## Future Test Enhancements

Planned improvements:
- [ ] Add fixtures for more departments
- [ ] Test concurrent scraping (multiple departments)
- [ ] Test retry logic (simulated failures)
- [ ] Test session expiry handling
- [ ] Performance benchmarks
- [ ] Test Supabase sync validation
- [ ] Test Google Sheets export
- [ ] Integration test suite with test database
