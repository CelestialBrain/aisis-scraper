# AISIS Data Scraper & Google Sheets Exporter

This project contains a Node.js-based web scraper that automatically logs into AISIS, scrapes 11 different data categories, and exports the data to a Google Sheet. The scraper is designed to run on a schedule using GitHub Actions.

## Features

- **Automated Scraping**: Runs on a 6-hour cron schedule.
- **11 Data Categories**: Scrapes a comprehensive set of student data.
- **Google Sheets Integration**: Automatically updates a Google Sheet with the latest data.
- **Simple Setup**: Uses a public Google Sheet with API key - no complex service account needed!
- **Secure Credential Management**: Uses GitHub Secrets for secure storage of credentials.
- **Puppeteer-based**: Uses a headless browser to mimic real user interaction.
- **Backup**: Saves a JSON backup of the scraped data as a GitHub artifact.

## Data Categories Scraped

1.  **Schedule of Classes**: All available class schedules for all departments.
2.  **Official Curriculum**: All official curriculum for all degree programs.
3.  **View Grades**: Your personal grades.
4.  **Advisory Grades**: Your advisory grades.
5.  **Currently Enrolled**: Your currently enrolled classes.
6.  **My Class Schedule**: Your personal class schedule.
7.  **Tuition Receipt**: Your tuition payment history.
8.  **Student Information**: Your personal student profile.
9.  **Program of Study**: Your academic program of study.
10. **Hold Orders**: Any hold orders on your account.
11. **Faculty Attendance**: Your attendance records.

## Getting Started

### 1. Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Copy the **Spreadsheet ID** from the URL: `https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit`

### 2. Make Your Sheet Publicly Editable

⚠️ **Security Note**: This makes your sheet editable by anyone with the link. Only use this for non-sensitive data or data you're comfortable being public.

1. Click the **Share** button in the top right.
2. Click **Change to anyone with the link**.
3. Set the permission to **Editor**.
4. Click **Done**.

### 3. Get a Google API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Google Sheets API**:
   - Go to **APIs & Services** > **Library**
   - Search for "Google Sheets API"
   - Click **Enable**
4. Create an API Key:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **API Key**
   - Copy the API key (you'll need this for GitHub Secrets)
   - (Optional but recommended) Click **Restrict Key** and limit it to only the Google Sheets API

### 4. Configure GitHub Secrets

In your GitHub repository, go to `Settings` > `Secrets and variables` > `Actions` and add the following secrets:

-   `AISIS_USERNAME`: Your AISIS username (e.g., `254880`)
-   `AISIS_PASSWORD`: Your AISIS password (e.g., `Passw123!`)
-   `GOOGLE_SPREADSHEET_ID`: The ID of your Google Sheet from step 1
-   `GOOGLE_API_KEY`: The API key you created in step 3

That's it! Much simpler than the service account setup! 🎉

## How It Works

-   **GitHub Actions**: The `.github/workflows/scrape.yml` file defines the workflow. It runs on a cron schedule, checks out the code, installs dependencies, and runs the scraper.
-   **Scraper (`src/scraper.js`)**: This script uses Puppeteer to launch a headless Chrome browser, log in to AISIS, and navigate to each of the 11 pages to scrape the data.
-   **Google Sheets (`src/sheets.js`)**: This script uses the `googleapis` library with an API key to update the Google Sheet with the scraped data.
-   **Main Script (`src/index.js`)**: This is the entry point that orchestrates the scraper and the Sheets manager.

## Running Locally (for Testing)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/CelestialBrain/aisis-scraper.git
    cd aisis-scraper
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Create a `.env` file**:
    Copy the `.env.example` file to `.env` and fill in your credentials.
    ```bash
    cp .env.example .env
    ```

4.  **Run the scraper**:
    ```bash
    npm start
    ```

## Security Considerations

Since this uses a public Google Sheet, anyone with the link can view and edit your data. If you need better security:

- Consider using a service account instead (more complex setup)
- Only scrape non-sensitive data
- Regularly monitor your sheet for unauthorized changes
- Use a private sheet with service account authentication (see `docs/SETUP.md` for the old method)

## License

This project is licensed under the MIT License.
