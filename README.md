# AISIS Data Scraper & Supabase Sync

This project contains a Node.js-based web scraper that automatically logs into AISIS, scrapes institutional data (class schedules and curriculum), and syncs the data to Supabase. The scraper is designed to run on a schedule using GitHub Actions.

## Features

- **Automated Scraping**: Runs on a scheduled basis via GitHub Actions.
- **Institutional Data Focus**: Scrapes class schedules and official curriculum data.
- **Supabase Integration**: Automatically syncs data to Supabase via Edge Functions.
- **Batched Sync Architecture**: Two-layer batching prevents 504 timeouts when syncing thousands of records.
- **Secure Credential Management**: Uses GitHub Secrets for secure storage of credentials.
- **Fast Mode**: Switched from Puppeteer to **Direct HTTP Requests (node-fetch + Cheerio)** for speed, stability, and low memory usage.
- **Production-Grade**: Built with error handling, robust data transformation, and partial failure recovery.

## Data Categories Scraped

1. **Schedule of Classes**: All available class schedules for all departments (runs every 6 hours). ✅ **Working**
2. **Official Curriculum**: ⚠️ **EXPERIMENTAL** - Curriculum scraping now supported via the `J_VOFC.do` endpoint. See [Curriculum Scraping Status](#curriculum-scraping-status) below for details.

## Curriculum Scraping Status

**Status**: ⚠️ **EXPERIMENTAL** - Curriculum scraping is now functional with structured parsing (like schedules)

### How It Works

The curriculum scraper uses the `J_VOFC.do` endpoint discovered through HAR file analysis and now includes **structured parsing**:

1. **GET** `J_VOFC.do` - Retrieves a form with a dropdown containing all curriculum versions
2. **Parse** `<select name="degCode">` - Extracts curriculum version identifiers (e.g., `BS CS_2024_1`)
3. **POST** `J_VOFC.do` with `degCode=<value>` - Fetches curriculum HTML for each version
4. **Parse HTML** to structured rows - Extracts year/semester headers and course data into structured objects (**NEW**)
5. **Sync** to Supabase and Google Sheets - Saves flat course rows with columns like schedules (**IMPROVED**)

### Structured Output

The curriculum scraper now produces **row-based structured data** similar to schedules, with each course as a separate row containing:
- `deg_code` - Degree program code
- `program_label` - Human-readable program name
- `year_level` - 1-4
- `semester` - 1-2
- `course_code` - Course identifier
- `course_title` - Course name
- `units` - Numeric units
- `prerequisites` - Prerequisites or null
- `category` - Course category (M, C, etc.) or null

This enables direct use in Google Sheets with proper columns, matching the schedule scraping behavior.

### Important Warnings

⚠️ **This is an EXPERIMENTAL feature** that depends on AISIS's HTML structure:
- May break if AISIS changes the `J_VOFC.do` page layout
- Not officially documented or supported by AISIS
- Discovered through network traffic analysis (HAR file)
- Should be treated as best-effort with monitoring

### Previous Limitation (J_VOPC.do)

Earlier versions attempted to use the non-existent `J_VOPC.do` endpoint, which returned HTTP 404. The working alternative `J_VOFC.do` was discovered later through HAR analysis.

### Alternative Solutions (Still Valid)

If `J_VOFC.do` becomes unreliable, consider:
1. **Scrape public curriculum pages**: Extract from `ateneo.edu/college/academics/degrees-majors`
2. **Manual curriculum data**: Maintain curated JSON from official PDFs
3. **Request API access**: Contact AISIS administrators for official endpoint

For technical details, see `docs/CURRICULUM_LIMITATION.md`.

## Getting Started

### 1. Set Up Supabase

You'll need a Supabase project with the appropriate Edge Functions deployed to receive scraped data.

1. Create a Supabase project at [https://supabase.com](https://supabase.com)
2. Deploy the Edge Functions from `supabase/functions/`:
   ```bash
   # Install Supabase CLI
   npm install -g supabase
   
   # Link to your project
   supabase link --project-ref YOUR_PROJECT_ID
   
   # Deploy the functions
   supabase functions deploy github-data-ingest
   supabase functions deploy aisis-scraper
   supabase functions deploy scrape-department
   supabase functions deploy import-schedules
   ```
3. Set up the database schema (see `supabase/functions/README.md`)
4. Generate an authentication token for the data ingest endpoint

### 2. Configure GitHub Secrets

In your GitHub repository, go to `Settings` > `Secrets and variables` > `Actions` and add the following secrets:

- `AISIS_USERNAME`: Your AISIS username
- `AISIS_PASSWORD`: Your AISIS password
- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://your-project-id.supabase.co`)
- `DATA_INGEST_TOKEN`: The authentication token for your Supabase data ingest endpoint

### 3. Term Auto-Detection

The scraper now **automatically detects** the current academic term from AISIS without requiring manual code changes. It reads the term from the Schedule of Classes page dropdown.

**To override the term** (e.g., for scraping historical data or for CI/scheduled runs), you can set the `AISIS_TERM` environment variable:

```bash
AISIS_TERM=2025-1 npm start
```

Or add it to your `.env` file:

```
AISIS_TERM=2025-1
```

**Legacy support**: The `APPLICABLE_PERIOD` environment variable is still supported for backward compatibility, but `AISIS_TERM` takes precedence if both are set.

If no override is provided, the scraper will auto-detect and use the currently selected term in AISIS. Using an override skips the term auto-detection request, which can speed up startup time in CI environments.

### 4. Baseline Tracking and Regression Detection

The scraper includes automatic regression detection to alert when scraped record counts drop significantly between runs.

#### How It Works

- After each scrape, the total record count and per-department counts are saved as a "baseline" in `logs/baselines/baseline-{term}.json`
- On subsequent runs for the same term, the current count is compared with the previous baseline
- If the count drops by more than a configurable threshold, a warning or error is triggered

#### Configuration

```bash
# Threshold percentage for triggering regression alert (default: 5.0)
BASELINE_DROP_THRESHOLD=5.0 npm start

# Warn-only mode: log warning but don't fail job (default: true)
# Set to false to fail the job when regression is detected
BASELINE_WARN_ONLY=true npm start
```

#### Example Output

```
📊 Baseline Comparison:
   Term: 2025-1
   Previous run: 2025-01-15T10:30:00.000Z
   Previous total: 4000 records
   Current total: 3520 records
   Change: -480 records (-12.00%)
   ⚠️ WARNING: Record count dropped by 480 records (12.00%)
   This exceeds the configured threshold of 5.0%
```

The baseline files are stored locally in `logs/baselines/` and are not committed to git (already in .gitignore). In GitHub Actions, these files are ephemeral unless you configure artifact upload.

### 5. Performance Tuning

The scraper includes several performance optimization options:

#### Supabase Sync Batch Size

Control how many records are sent to the Edge Function in each HTTP request:

```bash
SUPABASE_CLIENT_BATCH_SIZE=2000 npm start  # Default: 2000
```

- **Larger values (e.g., 3000-5000)**: Fewer HTTP requests, faster total sync time, but higher memory usage
- **Smaller values (e.g., 500-1000)**: More granular progress reporting, safer for timeout prevention
- **Default (2000)**: Optimized for typical 3000-4000 course datasets, resulting in 1-3 Edge Function calls

The Edge Function further splits large batches into smaller database transactions (100 records by default) to prevent individual transaction timeouts.

## How It Works

- **GitHub Actions**: The project has two workflows:
  - `.github/workflows/scrape-institutional-data.yml`: Runs every 6 hours to scrape class schedules
  - `.github/workflows/scrape-curriculum.yml`: Runs weekly to scrape official curriculum data
- **Scraper (`src/scraper.js`)**: This script uses `node-fetch` to perform direct HTTP requests and `cheerio` to parse the HTML, eliminating the need for a headless browser (Puppeteer). This makes the scraper significantly faster and more stable.
- **Supabase Sync (`src/supabase.js`)**: This script transforms the scraped data and syncs it to Supabase via the `github-data-ingest` Edge Function endpoint.
- **Main Scripts**:
  - `src/index.js`: Entry point for scraping class schedules
  - `src/index-curriculum.js`: Entry point for scraping curriculum data

## Running Locally (for Testing)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CelestialBrain/aisis-scraper.git
   cd aisis-scraper
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create a `.env` file**:
   Copy the `.env.example` file to `.env` and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

   Your `.env` file should contain:
   ```
   AISIS_USERNAME=your_username
   AISIS_PASSWORD=your_password
   SUPABASE_URL=https://your-project-id.supabase.co
   DATA_INGEST_TOKEN=your_ingest_token
   
   # Optional: Override the term for manual scraping (skips auto-detection)
   # AISIS_TERM=2025-1
   
   # Optional: Performance tuning for Supabase sync
   # SUPABASE_CLIENT_BATCH_SIZE=2000
   ```

4. **Run the scraper**:
   
   For class schedules (production-ready):
   ```bash
   npm start
   ```
   
   For curriculum data (experimental - see status above):
   ```bash
   npm run curriculum  # May return curriculum data or empty array
   ```
   
   For testing the curriculum endpoint:
   ```bash
   node test-curriculum-endpoint.js
   ```

## Architecture

This is a **fast and stable scraper (v3)** that:
- Uses direct HTTP requests for reliability and speed
- Scrapes institutional data (class schedules and experimental curriculum support)
- Syncs directly to Supabase via Edge Functions
- Includes robust error handling and data transformation

### Batching Architecture (v3.1)

To handle large datasets (3000+ schedule records) without timeouts, the system uses **two-layer batching** with configurable batch sizes for optimal performance.

#### Layer 1: Client-Side Batching (`src/supabase.js`)
- Splits large datasets into configurable chunks (default: **2000 records**)
- Sends multiple HTTP requests to the Edge Function
- Prevents overwhelming the Edge Function with giant payloads
- Tracks partial failures across batches
- **Configurable via `SUPABASE_CLIENT_BATCH_SIZE` environment variable**

#### Layer 2: Server-Side Batching (Edge Functions)
- Further splits each request into **100-record database transactions** (default)
- Uses `upsert` with correct `onConflict` key: `term_code,subject_code,section,department`
- Partial failure handling - one failed batch doesn't block others
- Detailed logging for debugging
- **Configurable via `GITHUB_INGEST_DB_BATCH_SIZE` environment variable** (range: 50-500)

**Example: Syncing 3783 schedules (optimized)**
```
Client sends: 2 requests × ~2000 records each
  ↓
Each request: ~20 database batches × 100 records each
  ↓
Total: ~40 database transactions of 100 records
  ↓
Result: No timeouts, faster sync (~5-8 minutes vs 14-15 minutes)
```

**Previous architecture (v3.0): 8 requests × 500 records**
```
Client sends: 8 requests × ~500 records each  
  ↓
Each request: 5 database batches × 100 records each
  ↓
Total: 40 database transactions of 100 records
  ↓
Result: Slower due to HTTP overhead (14-15 minutes)
```

This architecture ensures:
- ✅ No 504 Gateway Timeout errors
- ✅ Graceful handling of partial failures
- ✅ Idempotent upserts (safe to re-run)
- ✅ Detailed error logging

For more details, see `supabase/functions/README.md`.

## Security Considerations

- All credentials are stored securely in GitHub Secrets or local `.env` files
- The Supabase sync endpoint should be protected with API key authentication
- Never commit your `.env` file to version control

## Data Validation and Testing

### Parser Validation

The scraper includes comprehensive tests to ensure all course patterns are correctly parsed:

```bash
npm test  # Run all parser tests
node tests/test-real-world-patterns.js  # Test with real AISIS patterns
```

The tests validate:
- **Decimal course codes**: `ENE 13.03i`, `ENGL 298.66`
- **Complex section codes**: `WXY1`, `ST1A`, `PT-GRAD`, `THES/DISS1-8`
- **0-unit enrollment objects**: `COMP`, `SUB-A`, `SUB-B`, `THES/DISS`, `YYY`, `ODEF`, `RESID`
- **Special markers**: `TBA (~)` for special enrollment courses
- **Graduate courses**: 200-300 level courses
- **Lab sections**: `LAB1-VW`, `LAB2-VW`

### Baseline Tracking

Baseline files are stored in `logs/baselines/baseline-{term}.json` and track:
- Total record count per term
- Per-department record counts
- Timestamp of scrape
- GitHub Actions metadata (if running in CI)

**Important**: Baseline files are local and not committed to git. To preserve baselines across GitHub Actions runs:

1. Upload baselines as artifacts:
   ```yaml
   - name: Upload baselines
     uses: actions/upload-artifact@v3
     with:
       name: baselines
       path: logs/baselines/
   ```

2. Download baselines before running scraper:
   ```yaml
   - name: Download baselines
     uses: actions/download-artifact@v3
     with:
       name: baselines
       path: logs/baselines/
     continue-on-error: true  # Don't fail if no previous baseline
   ```

### Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `AISIS_USERNAME` | - | **Required**: AISIS login username |
| `AISIS_PASSWORD` | - | **Required**: AISIS login password |
| `DATA_INGEST_TOKEN` | - | Supabase ingest endpoint token |
| `SUPABASE_URL` | - | Supabase project URL |
| `AISIS_TERM` | Auto-detect | Override term code (e.g., `2025-1`) |
| `SUPABASE_CLIENT_BATCH_SIZE` | `2000` | Records per HTTP request |
| `BASELINE_DROP_THRESHOLD` | `5.0` | Regression alert threshold (%) |
| `BASELINE_WARN_ONLY` | `true` | Warn only (don't fail job) on regression |

## License

This project is licensed under the MIT License.
