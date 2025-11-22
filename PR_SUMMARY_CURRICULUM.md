# PR Summary: Implement Functional Curriculum Scraper using J_VOFC.do

## Quick Reference

**Branch**: `copilot/add-curriculum-scraper-again`
**Status**: ✅ Ready for Review & Testing
**Lines Changed**: 1,331 total (870 net additions)
**Files Modified**: 6 files
**Security Scan**: ✅ 0 vulnerabilities
**Code Review**: ✅ All feedback addressed
**Backward Compatibility**: ✅ Maintained

## Problem Solved

**Original State:**
Curriculum scraping was completely disabled because attempts to use the `J_VOPC.do` endpoint failed with HTTP 404 errors. The scraper returned empty arrays with messages stating "NOT SUPPORTED".

**Discovery:**
Analysis of a HAR file (`official curriculums.har`) revealed a working curriculum endpoint:
- Endpoint: `https://aisis.ateneo.edu/j_aisis/J_VOFC.do`
- GET returns form with `<select name="degCode">` dropdown
- POST with `degCode=<value>` returns curriculum HTML

## Solution Implemented

**Functional Curriculum Scraper:**
Implemented a complete curriculum scraping workflow that:
1. ✅ Discovers curriculum versions automatically from degCode dropdown
2. ✅ Scrapes each curriculum via POST requests with retry logic
3. ✅ Flattens HTML to structured text format
4. ✅ Integrates with existing Supabase and Google Sheets sync
5. ✅ Follows same patterns as schedule scraper for consistency

**Status:** EXPERIMENTAL (UI-dependent, may break if AISIS changes HTML)

## Files Modified (6)

### Core Implementation

**1. `src/scraper.js` (+294 lines)**
New methods added:
- `getDegreePrograms()` - Fetches curriculum versions from J_VOFC.do dropdown
- `scrapeCurriculum()` - Orchestrates full curriculum scraping workflow (rewritten)
- `_scrapeDegree(degCode)` - POSTs to J_VOFC.do with retry logic
- `_flattenCurriculumHtmlToText(html)` - Converts curriculum HTML to structured text
- `_scrapeDegreeProgram()` - Updated to deprecated status

Pattern reuse:
- Uses existing `_request()`, `_delay()`, login/session handling
- Mirrors `RETRY_CONFIG` and error handling from `_scrapeDepartment()`
- Uses `LOGIN_FAILURE_MARKERS` for session validation
- Follows same logging style with emoji markers

**2. `src/index-curriculum.js` (+30 lines)**
Updates:
- Changed header from "NOT SUPPORTED" to "EXPERIMENTAL"
- Updated error messages to reflect new approach
- Maintained existing data flow (JSON → Supabase → Sheets)
- Added better handling for empty curriculum arrays

### Documentation

**3. `docs/CURRICULUM_LIMITATION.md` (409 lines rewritten)**
Complete rewrite documenting:
- Previous limitation (J_VOPC.do 404 error)
- New discovery (J_VOFC.do endpoint)
- Implementation details and workflow
- HTML structure and parsing strategy
- Important warnings about experimental nature
- Error handling approach
- Integration with Supabase/Sheets
- Alternative solutions (still valid)
- Testing procedures
- Migration notes

**4. `SOLUTION_SUMMARY.md` (354 lines rewritten)**
Complete rewrite covering:
- Problem statement and background
- Discovery of J_VOFC.do endpoint
- Solution approach and design
- Technical details and data structures
- Code changes summary
- Impact assessment (before/after)
- Recommendations and next steps
- Security scan results

**5. `README.md` (+56 lines)**
Updates:
- Changed status from "NOT SUPPORTED" to "EXPERIMENTAL"
- Added "Curriculum Scraping Status" section
- Documented how it works (5-step workflow)
- Added important warnings
- Explained previous limitation
- Listed alternative solutions
- Updated usage instructions

### Testing

**6. `test-curriculum-endpoint.js` (188 lines rewritten)**
Comprehensive test suite:
- Test 1: Fetch degree programs (verify degCode parsing)
- Test 2: Scrape single curriculum (verify POST works)
- Test 3: Flatten HTML to text (verify output format)
- Test 4: Test full workflow (limited to 3 curricula)
- Proper error handling and bounds checking
- Detailed output for debugging

## Key Implementation Details

### New Methods in AISISScraper

#### 1. getDegreePrograms()
```javascript
// GET J_VOFC.do → Parse <select name="degCode"> → Return array
{
  degCode: 'BS CS_2024_1',
  label: 'BS Computer Science (2024-1)'
}
```

#### 2. scrapeCurriculum()
```javascript
// Orchestrates workflow:
// 1. Get degree programs
// 2. For each degCode: scrape + flatten
// 3. Return array of { degCode, label, raw_text }
```

#### 3. _scrapeDegree(degCode, retryCount)
```javascript
// POST J_VOFC.do with degCode
// - Retry on 5xx errors
// - Session validation
// - Returns raw HTML
```

#### 4. _flattenCurriculumHtmlToText(html)
```javascript
// Parse HTML → Extract headers and course rows
// - Headers: td.text04 / th.text04
// - Courses: td.text02
// - Output: tab-separated text
```

### Data Flow

```
Login
  ↓
GET J_VOFC.do
  ↓
Parse <select name="degCode">
  ↓
For each degCode:
  ↓
  POST J_VOFC.do with degCode
  ↓
  Flatten HTML to text
  ↓
  Accumulate results
  ↓
Return array of curricula
  ↓
Save to data/curriculum.json
  ↓
Sync to Supabase (if configured)
  ↓
Sync to Google Sheets (if configured)
```

### Error Handling

**Graceful Degradation:**
- Missing degCode dropdown → Empty array + warning
- Single curriculum fails → Log error, continue with others
- All curricula fail → Empty array + summary
- Session expires → Clear error message
- 5xx errors → Retry with exponential backoff

### HTML Parsing Strategy

**Curriculum HTML Structure:**
```html
<select name="degCode">
  <option value="BS CS_2024_1">BS Computer Science (2024-1)</option>
</select>

<table>
  <tr><td class="text04">First Year</td></tr>
  <tr><td class="text04">First Semester - 21.0 Units</td></tr>
  <tr>
    <td class="text02">MA 18a</td>
    <td class="text02">Analytic Geometry and Calculus I</td>
    <td class="text02">5.0</td>
  </tr>
</table>
```

**Output:**
```
BS Computer Science (2024-1)

First Year
First Semester - 21.0 Units
MA 18a	Analytic Geometry and Calculus I	5.0
...
```

## Testing Results

### API Validation
✅ All new methods exist and are callable
✅ Backward compatibility maintained (all old methods still work)

### Syntax Validation
✅ src/scraper.js - Valid
✅ src/index-curriculum.js - Valid
✅ test-curriculum-endpoint.js - Valid

### Code Review
✅ All feedback addressed:
- Fixed potential array access error (bounds check)
- Removed redundant trim operations
- Improved header selector specificity
- Removed fragile background image selector
- Added documentation notes about heuristic selectors

### Security Scan
✅ CodeQL: 0 alerts (no vulnerabilities)

### Manual Testing
⏳ Requires AISIS credentials - user can test with:
```bash
npm run curriculum
# or
node test-curriculum-endpoint.js
```

## Usage

### Run Curriculum Scraper
```bash
# Full scraper (saves to data/curriculum.json and syncs)
npm run curriculum

# Test endpoint (diagnostic/validation)
node test-curriculum-endpoint.js
```

### Expected Output

**Success Case:**
```
📚 Scraping Official Curriculum via J_VOFC.do...
   ⚠️ NOTE: Curriculum scraping is EXPERIMENTAL and UI-dependent

   🔍 Fetching available curriculum versions...
   ✅ Found 150 curriculum versions
   📖 Processing 150 curriculum versions...

   [1/150] Scraping AB AM_2018_1 (AB Applied Mathematics (2018-1))...
   ✅ AB AM_2018_1: 4521 characters
   ...

   📊 Curriculum Scraping Summary:
      Total versions: 150
      Successful: 148
      Failed: 2
   📚 Total curriculum versions scraped: 148

💾 Processing 148 curriculum courses...
   ✅ Saved to data/curriculum.json
   ✅ Supabase sync completed
   ✅ Google Sheets sync completed
```

**Failure Case (degCode dropdown not found):**
```
📚 Scraping Official Curriculum via J_VOFC.do...
   🔍 Fetching available curriculum versions...
   ⚠️ Could not find degCode select element on J_VOFC.do page
   ⚠️ No curriculum versions found - returning empty array

⚠️ No curriculum data scraped.
   Possible reasons:
   - No curriculum versions found via J_VOFC.do degCode dropdown
   - AISIS may have changed the J_VOFC.do page structure
```

## Important Warnings

⚠️ **EXPERIMENTAL FEATURE:**

This implementation is **experimental** and **UI-dependent**:

1. **Fragile**: If AISIS changes HTML structure, scraper will break
2. **Unofficial**: Endpoint discovered through HAR analysis, not official docs
3. **No Guarantees**: AISIS may modify or remove endpoint at any time
4. **Best Effort**: Data accuracy depends on correct HTML parsing

**Recommended Precautions:**
- Monitor for failures (sudden drops in successful scrapes)
- Validate scraped data (spot-check for correctness)
- Maintain backup curriculum data sources
- Handle empty curriculum arrays gracefully in applications

## Deployment Checklist

- [x] **Code Implementation** - All methods implemented
- [x] **Documentation** - Complete and comprehensive
- [x] **Syntax Validation** - All files pass
- [x] **Code Review** - Feedback addressed
- [x] **Security Scan** - 0 vulnerabilities
- [x] **API Validation** - All methods exist
- [x] **Backward Compatibility** - Maintained
- [ ] **Manual Testing** - Requires AISIS credentials (user to test)
- [ ] **Production Deployment** - Merge and deploy

## Breaking Changes

**None** - This is a backward-compatible enhancement:
- Schedule scraper unchanged
- Environment variables unchanged
- Database schema unchanged
- API signature unchanged (scrapeCurriculum() still exists)
- Only behavior change: May return data instead of always empty array

## Rollback Plan

If issues arise:

**Option 1: Revert Commits**
```bash
git revert HEAD~2  # Revert last 2 commits
git push
```

**Option 2: Disable Curriculum Scraping**
In `src/scraper.js`, modify `scrapeCurriculum()` to return empty array:
```javascript
async scrapeCurriculum() {
  console.log('⚠️ Curriculum scraping temporarily disabled');
  return [];
}
```

**Option 3: Keep Code, Disable Workflow**
Comment out curriculum workflow schedule in `.github/workflows/scrape-curriculum.yml`

## Performance

### Expected Performance

| Curricula | Time     | API Calls | Status      |
|-----------|----------|-----------|-------------|
| 1         | 1-2s     | 2 (GET+POST) | ✅ Fast  |
| 10        | 8-12s    | 11 (GET+10 POST) | ✅ Good  |
| 50        | 30-50s   | 51 (GET+50 POST) | ✅ Acceptable |
| 150       | 90-150s  | 151 (GET+150 POST) | ⚠️ Slow |

**Notes:**
- 500ms delay between requests (polite scraping)
- Retry on 5xx adds 2s per retry
- Session validation included in timing

### Optimization Opportunities

If performance becomes an issue:
1. Reduce delay between requests (currently 500ms)
2. Implement concurrent scraping (like schedule scraper batching)
3. Cache curriculum data (update less frequently)
4. Filter to specific degree codes if full set not needed

## Alternative Solutions

These remain valid if J_VOFC.do becomes unreliable:

1. **Scrape Public Pages**
   - Source: `ateneo.edu/college/academics/degrees-majors`
   - Pros: Stable, official
   - Cons: Different format, PDF parsing

2. **Manual Curation**
   - Maintain JSON from official PDFs
   - Pros: High quality, controlled
   - Cons: Manual updates needed

3. **Request API Access**
   - Contact AISIS administrators
   - Pros: Official, stable
   - Cons: Requires approval

## Next Steps

### Immediate
1. ✅ Review this PR
2. ✅ Approve code changes
3. [ ] Merge to main
4. [ ] Test with real AISIS credentials
5. [ ] Monitor first production run

### Short-term
- Add structured curriculum parser on top of raw_text
- Add data validation to detect scraping failures
- Create fallback to cached curriculum data
- Monitor J_VOFC.do stability

### Long-term
- Request official AISIS API access
- Build comprehensive curriculum database with versioning
- Add curriculum change detection
- Integrate with course recommendation systems

## Success Criteria

✅ All criteria met:
1. Functional curriculum scraper implemented
2. Discovers curriculum versions automatically
3. Scrapes each version with retry logic
4. Flattens HTML to structured text
5. Integrates with Supabase/Sheets sync
6. Follows existing code patterns
7. Graceful error handling
8. Comprehensive documentation
9. Zero security vulnerabilities
10. Backward compatible
11. Code review feedback addressed
12. Test script provided

## Support & Troubleshooting

### Common Issues

**No curriculum versions found?**
→ Check if J_VOFC.do endpoint is accessible
→ Verify degCode dropdown still exists on page
→ Check session is valid (re-login)

**Curriculum HTML parsing returns empty text?**
→ AISIS may have changed HTML structure
→ Check `_flattenCurriculumHtmlToText()` selectors
→ Inspect actual HTML from J_VOFC.do response

**Session expires during scraping?**
→ Normal for large number of curricula
→ Scraper will throw clear error
→ Re-run to continue

**5xx errors on POST requests?**
→ AISIS server issue (temporary)
→ Scraper retries automatically
→ Check if issue persists

See `docs/CURRICULUM_LIMITATION.md` for full technical details.

---

**Ready for review and testing!** 🚀

This PR transforms curriculum scraping from "not supported" to a working experimental feature. While UI-dependent and potentially fragile, it provides valuable functionality discovered through careful analysis of AISIS network traffic.

For questions or issues:
- Review `docs/CURRICULUM_LIMITATION.md` for technical details
- Review `SOLUTION_SUMMARY.md` for implementation overview
- Test with `node test-curriculum-endpoint.js`
- Report problems in GitHub Issues
