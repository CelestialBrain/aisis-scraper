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
2. **Official Curriculum**: ⚠️ **NOT SUPPORTED** - The AISIS system does not provide a public endpoint for scraping official curriculum data. See [Curriculum Scraping Limitation](#curriculum-scraping-limitation) below for details.

## Curriculum Scraping Limitation

**Important**: Curriculum scraping is currently not supported due to AISIS system limitations.

### Why It Doesn't Work
- The endpoint `/j_aisis/J_VOPC.do` (View Official Program Curriculum) does not exist (returns HTTP 404)
- `J_VIPS.do` (View Individual Program of Study) is student-specific and requires individual student context
- Official curricula are published as PDFs on the Ateneo website, not available through AISIS scraping API

### Alternative Solutions
1. **Scrape public curriculum pages**: Extract curriculum from publicly available Ateneo curriculum pages
2. **Manual curriculum data**: Maintain a manually curated JSON file with curriculum information
3. **Request API access**: Contact AISIS administrators to request dedicated API access for curriculum data

The curriculum scraper workflow will complete successfully but return empty results with informative messages.

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

**To override the term** (e.g., for scraping historical data), you can set the `APPLICABLE_PERIOD` environment variable:

```bash
APPLICABLE_PERIOD=2024-2 npm start
```

Or add it to your `.env` file:

```
APPLICABLE_PERIOD=2024-2
```

If no override is provided, the scraper will auto-detect and use the currently selected term in AISIS.

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
   
   # Optional: Override the term for manual scraping
   # APPLICABLE_PERIOD=2024-2
   ```

4. **Run the scraper**:
   
   For class schedules (working):
   ```bash
   npm start
   ```
   
   For curriculum data (not supported - see limitation above):
   ```bash
   npm run curriculum  # Will complete but return no data
   ```

## Architecture

This is a **fast and stable scraper (v3)** that:
- Uses direct HTTP requests for reliability and speed
- Focuses on institutional data (class schedules)
- Syncs directly to Supabase via Edge Functions
- Includes robust error handling and data transformation

### Batching Architecture (v3.1)

To handle large datasets (3000+ schedule records) without timeouts, the system uses **two-layer batching**:

#### Layer 1: Client-Side Batching (`src/supabase.js`)
- Splits large datasets into **500-record chunks**
- Sends multiple HTTP requests to the Edge Function
- Prevents overwhelming the Edge Function with giant payloads
- Tracks partial failures across batches

#### Layer 2: Server-Side Batching (Edge Functions)
- Further splits each request into **100-record database transactions**
- Uses `upsert` with correct `onConflict` key: `term_code,subject_code,section,department`
- Partial failure handling - one failed batch doesn't block others
- Detailed logging for debugging

**Example: Syncing 3927 schedules**
```
Client sends: 8 requests × ~500 records each
  ↓
Each request: 5 database batches × 100 records each
  ↓
Total: 40 database transactions of 100 records
  ↓
Result: No timeouts, complete sync in ~30-50 seconds
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

## License

This project is licensed under the MIT License.
