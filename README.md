# AISIS Data Scraper & Supabase Sync

This project contains a Node.js-based web scraper that automatically logs into AISIS, scrapes institutional data (class schedules and curriculum), and syncs the data to Supabase. The scraper is designed to run on a schedule using GitHub Actions.

## Features

- **Automated Scraping**: Runs on a scheduled basis via GitHub Actions.
- **Institutional Data Focus**: Scrapes class schedules and official curriculum data.
- **Supabase Integration**: Automatically syncs data to Supabase via Edge Functions.
- **Secure Credential Management**: Uses GitHub Secrets for secure storage of credentials.
- **Fast Mode**: Switched from Puppeteer to **Direct HTTP Requests (node-fetch + Cheerio)** for speed, stability, and low memory usage.
- **Production-Grade**: Built with error handling and robust data transformation.

## Data Categories Scraped

1. **Schedule of Classes**: All available class schedules for all departments.
2. **Official Curriculum**: All official curriculum for all degree programs.

## Getting Started

### 1. Set Up Supabase

You'll need a Supabase project with the appropriate Edge Function endpoint configured to receive scraped data.

1. Create a Supabase project at [https://supabase.com](https://supabase.com)
2. Deploy the `github-data-ingest` Edge Function (see your Supabase project documentation)
3. Generate an authentication token for the data ingest endpoint

### 2. Configure GitHub Secrets

In your GitHub repository, go to `Settings` > `Secrets and variables` > `Actions` and add the following secrets:

- `AISIS_USERNAME`: Your AISIS username
- `AISIS_PASSWORD`: Your AISIS password
- `DATA_INGEST_TOKEN`: The authentication token for your Supabase data ingest endpoint

### 3. Term Detection (Automatic)

The scraper **automatically detects the current academic term** from the AISIS Schedule of Classes page. No manual configuration is needed!

#### Override the Term (Optional)

If you need to scrape a specific term (e.g., for historical data or testing), you can override the auto-detection:

- **Via Environment Variable**: Set `APPLICABLE_PERIOD` in your `.env` file or GitHub Secrets
  ```bash
  APPLICABLE_PERIOD=2025-1  # First Semester 2025
  APPLICABLE_PERIOD=2025-2  # Second Semester 2025
  ```

- **Programmatically**: Pass the term as an argument to `scraper.scrapeSchedule('2025-1')`

## How It Works

- **GitHub Actions**: The `.github/workflows/scrape.yml` file defines the workflow. It runs on a schedule, checks out the code, installs dependencies, and runs the scraper.
- **Scraper (`src/scraper.js`)**: This script uses `node-fetch` to perform direct HTTP requests and `cheerio` to parse the HTML, eliminating the need for a headless browser (Puppeteer). This makes the scraper significantly faster and more stable.
- **Supabase Sync (`src/supabase.js`)**: This script transforms the scraped data and syncs it to Supabase via the `github-data-ingest` Edge Function endpoint.
- **Main Script (`src/index.js`)**: This is the entry point that orchestrates the scraper and the Supabase sync manager.

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
   DATA_INGEST_TOKEN=your_ingest_token
   ```

4. **Run the scraper**:
   ```bash
   npm start
   ```

## Architecture

This is a **fast and stable scraper (v3)** that:
- Uses direct HTTP requests for reliability and speed
- Focuses on institutional data (schedules and curriculum)
- Syncs directly to Supabase via Edge Functions
- Includes robust error handling and data transformation
- **Automatically detects the current academic term** from AISIS

## Troubleshooting

### No courses found

If the scraper reports "No schedule data found", this could mean:

1. **Term not published yet**: AISIS may not have published courses for the detected term
2. **Between semesters**: The current term might be Intersession (term code ending in `-0`)
3. **System issues**: AISIS might be experiencing technical difficulties

To verify the detected term:
- Check the logs for "Detected term: X (readable description)"
- Try manually overriding with `APPLICABLE_PERIOD` to scrape a known valid term

### HTTP 500 Errors

The scraper includes automatic retry logic for HTTP 500 errors. If errors persist:

1. Check if AISIS is accessible in your browser
2. Verify your session is still valid (cookies may have expired)
3. Some departments may temporarily return errors - the scraper will continue with other departments

### Term Detection Issues

If term auto-detection fails:

1. The scraper will throw a clear error explaining what went wrong
2. You can bypass auto-detection by setting `APPLICABLE_PERIOD` environment variable
3. Check the AISIS website to verify the Schedule of Classes page structure hasn't changed

## Security Considerations

- All credentials are stored securely in GitHub Secrets or local `.env` files
- The Supabase sync endpoint should be protected with API key authentication
- Never commit your `.env` file to version control

## License

This project is licensed under the MIT License.
