# Google Cloud & Service Account Setup Guide (LEGACY)

⚠️ **Note**: This guide is for the **old, more complex** service account method. The project now uses a **simpler public sheet approach** with just an API key. See the main README.md for the new simplified setup.

**Only use this guide if you need private sheet access with service account authentication.**

---

This guide provides detailed, step-by-step instructions for setting up a Google Cloud project, enabling the Google Sheets API, and creating a service account with the necessary permissions to allow the scraper to update your Google Sheet.

## Step 1: Create a New Google Cloud Project

1.  **Go to the Google Cloud Console**: [https://console.cloud.google.com/](https://console.cloud.google.com/)

2.  **Create a new project**:
    *   Click the project dropdown in the top navigation bar.
    *   Click **New Project**.
    *   Enter a **Project name** (e.g., `aisis-data-scraper`).
    *   Select a **Billing account** if required.
    *   Click **Create**.

3.  **Select your new project** from the project dropdown.

## Step 2: Enable the Google Sheets API

1.  **Navigate to the API Library**:
    *   In the Google Cloud Console, open the navigation menu (hamburger icon in the top left).
    *   Go to `APIs & Services` > `Library`.

2.  **Search for the Google Sheets API**:
    *   In the search bar, type `Google Sheets API` and press Enter.
    *   Click on the **Google Sheets API** result.

3.  **Enable the API**:
    *   Click the **Enable** button. This may take a few moments.

## Step 3: Create a Service Account

A service account is a special type of Google account that an application (like our scraper) can use to make authorized API calls.

1.  **Go to the Service Accounts page**:
    *   In the navigation menu, go to `IAM & Admin` > `Service Accounts`.

2.  **Create a new service account**:
    *   Click **+ Create Service Account** at the top of the page.
    *   **Service account name**: Enter a name (e.g., `aisis-sheets-updater`).
    *   **Service account ID**: This will be automatically generated.
    *   **Description**: Add a description (e.g., `Service account for the AISIS scraper to update Google Sheets`).
    *   Click **Create and Continue**.

3.  **Grant permissions (optional but recommended)**:
    *   In the **Role** dropdown, select `Project` > `Editor`. This gives the service account broad permissions within the project. For a more secure setup, you could create a custom role with only the necessary permissions, but `Editor` is sufficient for this project.
    *   Click **Continue**.

4.  **Grant user access (optional)**:
    *   You can skip this section. Click **Done**.

## Step 4: Create and Download a Service Account Key

The key is a JSON file that contains the credentials your scraper will use to authenticate.

1.  **Find your new service account** in the list.

2.  **Create a key**:
    *   Click the three-dot menu (Actions) on the right side of your service account.
    *   Select **Manage keys**.
    *   Click **Add Key** > **Create new key**.

3.  **Choose the key type**:
    *   Select **JSON** as the key type.
    *   Click **Create**.

4.  **Download and save the key**:
    *   A JSON file will be automatically downloaded to your computer. **This is the only time you can download this file, so keep it safe!**
    *   This JSON file contains the `private_key`, `client_email`, and other credentials you'll need for the GitHub Secrets.

## Step 5: Find Your Service Account Email

1.  Go back to the **Service Accounts** page (`IAM & Admin` > `Service Accounts`).
2.  Your service account's email address will be listed in the **Email** column. It will look something like this:
    `aisis-sheets-updater@your-project-id.iam.gserviceaccount.com`

**You will need this email address to share your Google Sheet with the service account.**

## What's Next?

Now that you have your service account set up and the JSON key file downloaded, you can proceed with the following steps:

1.  **Share your Google Sheet** with the service account email, giving it **Editor** permissions.
2.  **Configure the GitHub Secrets** in your repository using the information from the downloaded JSON file and your Google Sheet ID.

**Note**: If you're using the new simplified public sheet method, you don't need any of this! Just follow the instructions in the main README.md instead.
