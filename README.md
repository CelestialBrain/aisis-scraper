# AISIS Data Scraper & Google Sheets Exporter

This project contains a Node.js-based web scraper that automatically logs into AISIS, scrapes 11 different data categories, and exports the data to a Google Sheet. The scraper is designed to run on a schedule using GitHub Actions.

## Features

- **Automated Scraping**: Runs on a 6-hour cron schedule.
- **11 Data Categories**: Scrapes a comprehensive set of student data.
- **Google Sheets Integration**: Automatically updates a Google Sheet with the latest data.
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

To get this scraper working, you need to configure your Google Service Account and set up secrets in your GitHub repository.

### 1. Google Cloud & Service Account Setup

This is the most complex part. You need to create a Google Cloud project, enable the Google Sheets API, and create a service account with the right permissions.

**For detailed, step-by-step instructions, please follow the guide here: [SETUP.md](docs/SETUP.md)**

### 2. Share Your Google Sheet

Once you have your service account email (it will look like `your-service-account-name@your-project-id.iam.gserviceaccount.com`), you need to share your Google Sheet with it:

1.  Open your Google Sheet.
2.  Click the **Share** button in the top right.
3.  In the "Add people, groups..." field, paste your service account email.
4.  Make sure the role is set to **Editor**.
5.  Click **Send** (or **Share**).

### 3. Configure GitHub Secrets

In your GitHub repository, go to `Settings` > `Secrets and variables` > `Actions` and add the following secrets:

-   `AISIS_USERNAME`: Your AISIS username (e.g., `254880`)
-   `AISIS_PASSWORD`: Your AISIS password (e.g., `Passw123!`)
-   `GOOGLE_SPREADSHEET_ID`: The ID of your Google Sheet. You can get this from the URL: `https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit`
-   `GOOGLE_SERVICE_ACCOUNT_EMAIL`: The email of the service account you created.
-   `GOOGLE_PRIVATE_KEY`: The private key from the JSON file you downloaded when creating the service account. You need to copy the entire key, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.
-   `GOOGLE_PROJECT_ID`: Your Google Cloud project ID.
-   `GOOGLE_PRIVATE_KEY_ID`: The `private_key_id` from your service account JSON file.
-   `GOOGLE_CLIENT_ID`: The `client_id` from your service account JSON file.

## How It Works

-   **GitHub Actions**: The `.github/workflows/scrape.yml` file defines the workflow. It runs on a cron schedule, checks out the code, installs dependencies, and runs the scraper.
-   **Scraper (`src/scraper.js`)**: This script uses Puppeteer to launch a headless Chrome browser, log in to AISIS, and navigate to each of the 11 pages to scrape the data.
-   **Google Sheets (`src/sheets.js`)**: This script uses the `googleapis` library to authenticate with your service account and update the Google Sheet with the scraped data.
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

## License

This project is licensed under the MIT License.
