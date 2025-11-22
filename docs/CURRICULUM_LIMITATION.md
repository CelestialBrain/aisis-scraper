# Curriculum Scraping Limitation - Technical Details

## Issue Summary

The AISIS curriculum scraper does not work because the required endpoint does not exist in the AISIS system.

## Background

The original implementation attempted to scrape official curriculum data for all degree programs using the endpoint:
```
POST /j_aisis/J_VOPC.do
```

However, this endpoint **does not exist** in AISIS and returns **HTTP 404**.

## Investigation Results

### Tested Endpoints

1. **J_VOPC.do** (View Official Program Curriculum)
   - Status: ❌ Returns 404 (does not exist)
   - Attempted with POST requests and various parameters
   - Result: Endpoint does not exist

2. **printCurriculum.do**
   - Status: ⚠️ May exist but requires specific parameters
   - Used for printing individual student curricula
   - Not suitable for bulk scraping all programs

3. **J_VIPS.do** (View Individual Program of Study)
   - Status: ✅ Exists but limited
   - Purpose: Student-specific individual program view
   - Limitation: Requires student context, not for all programs

### Research Findings

1. **AISIS System Design**
   - AISIS is designed for individual student access
   - Institutional data (schedules) has dedicated endpoints
   - Curriculum data is student-specific or published as PDFs

2. **Other Implementations**
   - Reviewed `itsalexi/Ateneo-Enlistment` Python scraper - no curriculum scraping
   - Reviewed `CelestialBrain/aisis-website-scraper` - no institutional curriculum scraping
   - Confirmed pattern: schedule scraping works, curriculum scraping doesn't

3. **Official Sources**
   - Official curricula published on ateneo.edu as PDFs
   - No public API for programmatic curriculum access
   - Curricula maintained by Office of the Registrar

## Solution Implemented

### Code Changes

1. **Graceful Degradation**
   - Changed `scrapeCurriculum()` to return empty array instead of failing
   - Added clear console messages explaining the limitation
   - Removed broken parsing logic

2. **Documentation**
   - Updated README.md with limitation section
   - Added inline code comments
   - Created this technical details document

3. **User Experience**
   - Workflow completes successfully (no errors)
   - Clear messaging about why no data is returned
   - Guidance on alternative solutions

### Impact

**Before Fix:**
```
❌ Test failed for BS ITE: HTTP 404 for degree BS ITE
📚 Total curriculum courses: 0
⚠️ No curriculum data found.
```

**After Fix:**
```
⚠️  CURRICULUM SCRAPING IS NOT SUPPORTED
═══════════════════════════════════════════════════════
The AISIS system does not provide a public endpoint for
scraping official curriculum data for all degree programs.

Why this doesn't work:
  • The J_VOPC.do endpoint returns HTTP 404 (does not exist)
  • J_VIPS.do is for individual student programs only
  • Official curricula are published as PDFs on ateneo.edu

Alternative approaches:
  • Scrape from public Ateneo curriculum pages
  • Use manually curated curriculum JSON
  • Request API access from AISIS administrators
═══════════════════════════════════════════════════════

📚 Total curriculum courses: 0
```

## Alternative Solutions

### 1. Scrape Public Curriculum Pages

Ateneo publishes curriculum information on their public website. A separate scraper could:

1. Navigate to curriculum pages (e.g., `ateneo.edu/college/academics/degrees-majors`)
2. Extract curriculum PDFs or HTML tables
3. Parse and structure the data
4. Store in Supabase

**Pros:** 
- Publicly accessible data
- No authentication required
- Officially maintained content

**Cons:**
- Different scraping logic needed
- Format may vary by program
- Less frequently updated

### 2. Manual Curriculum JSON

Create a manually curated curriculum dataset:

1. Download official curriculum PDFs from Ateneo
2. Extract course information
3. Create structured JSON files
4. Version control curriculum data
5. Upload to Supabase via data migration

**Pros:**
- Complete control over data quality
- Can add metadata and annotations
- Reliable and stable

**Cons:**
- Manual maintenance required
- Updates need manual intervention
- Labor-intensive initial setup

### 3. Request AISIS API Access

Contact AISIS administrators to request:

1. Dedicated API endpoint for curriculum data
2. Authentication credentials
3. Documentation for the API

**Pros:**
- Official data source
- Automated updates possible
- Potentially includes all degree programs

**Cons:**
- Requires approval from university
- May not be granted
- Timeline uncertain

## Recommendations

### Short-term (Immediate)
✅ **Use the updated code** - Workflow completes without errors
✅ **Document limitation** - Users understand why curriculum is unavailable

### Medium-term (1-3 months)
1. **Implement public page scraper** for curriculum data from ateneo.edu
2. **Create sample curriculum JSON** as a template for manual curation
3. **Test with 1-2 degree programs** to validate approach

### Long-term (3+ months)
1. **Request official API access** from AISIS team
2. **Build comprehensive curriculum database** using chosen method
3. **Automate updates** via scheduled scraping or manual process

## Technical Notes

### Workflow Configuration

The curriculum workflow (`.github/workflows/scrape-curriculum.yml`) should either:

1. **Keep as-is**: Runs successfully but returns no data (current state)
2. **Disable temporarily**: Comment out the schedule trigger
3. **Repurpose**: Convert to public page scraper when implemented

### Database Schema

The existing Supabase schema for `aisis_curriculum` can be kept for future use:

```sql
CREATE TABLE aisis_curriculum (
  id BIGSERIAL PRIMARY KEY,
  degree_code TEXT,
  year_level TEXT,
  semester TEXT,
  course_code TEXT,
  course_description TEXT,
  units NUMERIC,
  category TEXT
);
```

## References

- AISIS Login: https://aisis.ateneo.edu/j_aisis/displayLogin.do
- Ateneo Curriculum (public): https://www.ateneo.edu/college/academics/degrees-majors
- Office of Registrar: https://sites.google.com/ateneo.edu/ls-ro/records-and-registration/curriculum-maintenance

## Conclusion

Curriculum scraping via AISIS is **not possible** due to system limitations. The implemented fix ensures the workflow runs smoothly while providing clear communication about the limitation. Alternative solutions are available and documented for future implementation.
