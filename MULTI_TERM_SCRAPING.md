# Multi-Term Scraping Support

## Overview

The AISIS scraper now supports scraping data for multiple academic terms in a single run. This feature allows automated collection of schedule data for current and future terms, enabling better planning and data availability.

## Features

### 1. Available Terms Discovery

The scraper can automatically discover all available terms from the AISIS Schedule of Classes page.

```javascript
const terms = await scraper.getAvailableTerms();
// Returns: [
//   { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
//   { value: '2025-0', label: '2025-2026-Intersession', selected: false },
//   { value: '2025-1', label: '2025-2026-First Semester', selected: true },
//   ...
// ]
```

### 2. Term Comparison Utility

A utility function `compareTermCodes(a, b)` allows sorting and filtering terms:

```javascript
import { compareTermCodes } from './src/scraper.js';

const terms = ['2025-1', '2024-2', '2025-0'];
terms.sort(compareTermCodes);
// Result: ['2024-2', '2025-0', '2025-1']
```

Term format: `YYYY-S` where:
- `YYYY` = Academic year (e.g., 2024, 2025)
- `S` = Semester: 0 (Intersession), 1 (First Semester), 2 (Second Semester)

### 3. Multi-Term Scraping

The `scrapeMultipleTerms(terms)` method scrapes data for multiple terms:

```javascript
const results = await scraper.scrapeMultipleTerms(['2024-2', '2025-0', '2025-1']);
// Returns array of results, one per term
```

## Scrape Modes

The scraper supports four modes via the `AISIS_SCRAPE_MODE` environment variable:

### `current` (default)
- Scrapes only the current term
- Maintains backward compatibility with existing behavior
- Used by the scheduled workflow (every 6 hours)

### `future`
- Scrapes only future terms (terms after the current term)
- Useful for planning and pre-loading upcoming schedules
- **Note**: This mode may miss intersession terms (term `*-0`) if they have a code less than the current term

### `all`
- Scrapes both current and future terms
- Useful for comprehensive data collection
- Available via manual workflow dispatch

### `year` (recommended for weekly workflow)
- Scrapes **all terms in the current term's academic year**
- Based on the year portion of the term code (e.g., `2025-*` for all 2025 terms)
- Includes intersession (term `*-0`), first semester (term `*-1`), and second semester (term `*-2`)
- Used by the weekly workflow (`scrape-future-terms.yml`) to ensure all terms in the academic year are kept fresh
- **Key benefit**: Reliably captures intersession terms that `future` mode might miss

**Example**: If the current term is `2025-1` (First Semester 2025-2026):
- `year` mode scrapes: `2025-0`, `2025-1`, `2025-2` (all 2025-* terms)
- `future` mode scrapes: `2025-2`, `2026-0` (terms > `2025-1`)
- Notice that `future` mode misses `2025-0` (intersession), while `year` mode includes it

## Environment Variables

### New Variables

- `AISIS_SCRAPE_MODE`: Set to `current`, `future`, `all`, or `year` (default: `current`)

### Existing Variables (unchanged)

- `AISIS_USERNAME`: AISIS login username
- `AISIS_PASSWORD`: AISIS login password
- `AISIS_TERM`: Optional term override (skips auto-detection)
- `DATA_INGEST_TOKEN`: Supabase edge function auth token
- `GOOGLE_SERVICE_ACCOUNT`: Google Sheets service account credentials (base64)
- `SPREADSHEET_ID`: Google Sheets spreadsheet ID

## Usage Examples

### Example 1: Scrape Current Term Only (default)

```bash
npm start
# or
AISIS_SCRAPE_MODE=current npm start
```

### Example 2: Scrape Future Terms

```bash
AISIS_SCRAPE_MODE=future npm start
```

### Example 3: Scrape All Available Terms

```bash
AISIS_SCRAPE_MODE=all npm start
```

### Example 4: Programmatic Use

```javascript
import { AISISScraper, compareTermCodes } from './src/scraper.js';

const scraper = new AISISScraper(username, password);
await scraper.init();
await scraper.login();

// Get all available terms
const allTerms = await scraper.getAvailableTerms();

// Find current term
const currentTerm = allTerms.find(t => t.selected);

// Filter for future terms
const futureTerms = allTerms
  .filter(t => compareTermCodes(t.value, currentTerm.value) > 0)
  .map(t => t.value)
  .sort(compareTermCodes);

// Scrape future terms
const results = await scraper.scrapeMultipleTerms(futureTerms);
```

## Data Storage

### Local Files

In single-term mode:
- `data/courses.json`: Flat array of all courses
- `data/schedules-per-department.json`: Organized by department

In multi-term mode:
- `data/courses.json`: Combined flat array of all courses from all terms
- `data/schedules-per-department.json`: Multi-term structure with per-term breakdown

### Supabase

Each term's data is synced separately to maintain term isolation:
- Delete operations are scoped by `term_code`
- Upsert operations use `(term_code, subject_code, section, department)` as unique key
- Multi-term scraping is **safe** - each term is processed independently

### Google Sheets

In single-term mode:
- Creates/updates single tab named "Schedules"

In multi-term mode:
- Creates/updates one tab per term
- Tab names use term codes (e.g., "2024-1", "2025-0", "2025-1")
- Each tab contains the same structure as single-term mode

## Workflows

### AISIS – Class Schedule (Current Term)

**File**: `scrape-institutional-data.yml`

- **Schedule**: Every 6 hours
- **Mode**: `current` (scrapes only current term)
- **Purpose**: Keep current term data fresh
- **Manual Dispatch**: Supports choosing mode via dropdown

### AISIS – Class Schedule (Full Academic Year)

**File**: `aisis-schedule-full-year.yml`

- **Schedule**: Manual trigger only (workflow_dispatch)
- **Mode**: Scrapes all three semesters for a specified academic year (`YYYY-0`, `YYYY-1`, `YYYY-2`)
- **Purpose**: Comprehensive scrape of a complete academic year
- **Manual Dispatch**: Accepts `target_year` input (defaults to current calendar year)
- **Output**: Saves results to `logs/schedule-all-terms-{year}.json`

### AISIS – Class Schedule (All Available Terms)

**File**: `scrape-future-terms.yml`

- **Schedule**: Weekly on Sundays at 2 AM UTC
- **Mode**: `year` (scrapes all terms in current academic year)
- **Purpose**: Keep all terms in the current academic year fresh, including intersession (term `*-0`)
- **Manual Dispatch**: Supports choosing mode via dropdown (`current`, `future`, `all`, `year`)

**Note**: This workflow was previously named "AISIS Future Terms Scrape" and set to `future` mode, but now defaults to `year` mode to ensure intersession terms are reliably scraped.

## Implementation Details

### Methods Added to AISISScraper

#### `getAvailableTerms()`
- Fetches the Schedule of Classes page
- Parses `<select name="applicablePeriod">` dropdown
- Deduplicates options by value (AISIS can have duplicate options)
- Returns array of `{ value, label, selected }` objects

#### `scrapeMultipleTerms(terms)`
- Takes array of term codes
- Calls `scrapeSchedule(term)` for each term
- Continues on error (logs failure, returns empty result for failed term)
- Returns array of per-term results

### Utility Functions

#### `compareTermCodes(a, b)`
- Exported from `src/scraper.js`
- Compares two term codes numerically
- Returns: `<0` if a<b, `0` if a==b, `>0` if a>b
- Handles invalid formats gracefully (falls back to string comparison)

#### `getTermYear(termCode)`
- Exported from `src/constants.js`
- Extracts the year portion from a term code (e.g., `'2025-1'` → `'2025'`)
- Returns `null` for invalid term code formats
- Used by the `year` scrape mode to filter terms by academic year

## Baseline Tracking

Baseline tracking works per-term:
- Each term maintains its own baseline file: `logs/baselines/baseline-{term}.json`
- Regression detection runs independently for each term
- Allows detecting data loss on a per-term basis

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **Default behavior unchanged**: Without setting `AISIS_SCRAPE_MODE`, scrapes current term only
2. **Single-term data format preserved**: When scraping one term, output matches legacy format
3. **Google Sheets single-tab mode**: Single-term scraping continues using "Schedules" tab
4. **Existing workflows work**: Current workflow unchanged except for explicit mode setting

## Error Handling

- If term discovery fails, scraper falls back to error
- If individual term scraping fails in multi-term mode:
  - Error is logged
  - Empty result is returned for that term
  - Scraper continues with remaining terms
- Regression detection runs per-term (won't block other terms)

## Performance Considerations

### Network Requests

Multi-term scraping makes more requests:
- 1 request to discover available terms (if mode is `future`, `all`, or `year`)
- N × M requests where N = number of terms, M = number of departments
- Existing concurrency and batching controls still apply

### Recommendations

- Use `year` mode for weekly runs (scrapes all terms in the academic year, including intersession)
- Use `current` mode for frequent updates (existing behavior)
- Use `future` mode if you only want upcoming terms (but may miss intersession)
- Consider adjusting `AISIS_CONCURRENCY` and `AISIS_BATCH_DELAY_MS` if needed

## Testing

To test multi-term functionality:

```bash
# Run term year mode unit tests
node tests/test-term-year-mode.js

# Test term comparison
node -e "import('./src/scraper.js').then(m => {
  console.log(m.compareTermCodes('2024-1', '2024-2')); // -1
  console.log(m.compareTermCodes('2025-1', '2025-1')); // 0
  console.log(m.compareTermCodes('2025-2', '2025-1')); // 1
});"

# Test getTermYear helper
node -e "import('./src/constants.js').then(m => {
  console.log(m.getTermYear('2025-1')); // '2025'
  console.log(m.getTermYear('2025-0')); // '2025'
  console.log(m.getTermYear('invalid')); // null
});"

# Test year mode discovery (requires valid credentials)
AISIS_SCRAPE_MODE=year npm start
```

## Known Limitations

1. **AISIS availability**: Future terms may not have data until AISIS publishes them
2. **Performance**: Scraping multiple terms takes longer (proportional to number of terms)
3. **Baseline artifacts**: GitHub Actions artifact sharing may need attention for multi-term baselines

## Future Enhancements

Potential improvements for consideration:

1. **Selective term scraping**: Allow specifying exact term list via env var
2. **Parallel term scraping**: Scrape multiple terms concurrently (requires careful session management)
3. **Incremental updates**: Only re-scrape terms that have changed
4. **Historical data**: Archive old terms before they're removed from AISIS
