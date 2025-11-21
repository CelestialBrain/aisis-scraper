# AISIS Data Scraper & Supabase Sync

This project contains a Node.js-based web scraper that automatically logs into AISIS, scrapes institutional data (class schedules and curriculum), and syncs the data to Supabase. The scraper is designed to run on a schedule using GitHub Actions.

## Features

- **Automated Scraping**: Runs on a scheduled basis via GitHub Actions.
- **Institutional Data Focus**: Scrapes class schedules and official curriculum data.
- **Supabase Integration**: Automatically syncs data to Supabase via Edge Functions.
- **Secure Credential Management**: Uses GitHub Secrets for secure storage of credentials.
- **Puppeteer-based**: Uses a headless browser with native DOM extraction for reliable data scraping.
- **Production-Grade**: Built with error handling and robust data transformation.

## Data Categories Scraped

1. **Schedule of Classes**: All available class schedules for all departments.
2. **Official Curriculum**: All official curriculum for all degree programs.

## Getting Started

### 1. Set Up Supabase

You'll need a Supabase project with the appropriate Edge Function endpoint configured to receive scraped data.

1. Create a Supabase project at [https://supabase.com](https://supabase.com)
2. Deploy the `github-sync` Edge Function (see your Supabase project documentation)
3. Generate an API key for the sync endpoint

### 2. Configure GitHub Secrets

In your GitHub repository, go to `Settings` > `Secrets and variables` > `Actions` and add the following secrets:

- `AISIS_USERNAME`: Your AISIS username
- `AISIS_PASSWORD`: Your AISIS password
- `SUPABASE_SYNC_KEY`: The API key for your Supabase sync endpoint

### 3. Update Term Code

In `src/index.js`, update the `CURRENT_TERM` variable to match the current academic term:

```javascript
const CURRENT_TERM = '20253'; // Update this when the semester changes
```

## How It Works

- **GitHub Actions**: The `.github/workflows/scrape.yml` file defines the workflow. It runs on a schedule, checks out the code, installs dependencies, and runs the scraper.
- **Scraper (`src/scraper.js`)**: This script uses Puppeteer to launch a headless Chrome browser, log in to AISIS, and navigate to the schedule and curriculum pages to scrape the data using native DOM extraction.
- **Supabase Sync (`src/supabase.js`)**: This script transforms the scraped data and syncs it to Supabase via the `github-sync` Edge Function endpoint.
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
   SUPABASE_SYNC_KEY=your_sync_key
   ```

4. **Run the scraper**:
   ```bash
   npm start
   ```

## Architecture

This is a **production-grade scraper (v2)** that:
- Uses native DOM extraction for reliability
- Focuses on institutional data (schedules and curriculum)
- Syncs directly to Supabase via Edge Functions
- Includes robust error handling and data transformation

## Security Considerations

- All credentials are stored securely in GitHub Secrets or local `.env` files
- The Supabase sync endpoint should be protected with API key authentication
- Never commit your `.env` file to version control

## License

This project is licensed under the MIT License.
