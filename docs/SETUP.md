# Supabase Setup Guide

This guide provides detailed instructions for setting up the Supabase integration for the AISIS scraper.

## Overview

The AISIS scraper syncs data to Supabase using an Edge Function endpoint. This approach provides:
- **Serverless architecture**: No need to manage backend infrastructure
- **Secure API authentication**: Protected with API keys
- **Real-time data sync**: Automatic updates to your Supabase database
- **Scalability**: Handles large datasets efficiently

## Prerequisites

- A Supabase account ([sign up here](https://supabase.com))
- Basic familiarity with Supabase Edge Functions
- Node.js 18+ installed locally for testing

## Step 1: Create a Supabase Project

1. **Go to Supabase**: [https://supabase.com](https://supabase.com)
2. **Create a new project**:
   - Click **New Project**
   - Enter a **Project name** (e.g., `aisis-data`)
   - Set a **Database password** (save this securely)
   - Select a **Region** close to your location
   - Click **Create new project**

## Step 2: Set Up Database Tables

You'll need to create tables to store the scraped data. Here are the recommended schemas:

### Schedules Table

```sql
CREATE TABLE schedules (
  id BIGSERIAL PRIMARY KEY,
  term_code TEXT NOT NULL,
  department TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  section TEXT,
  course_title TEXT,
  units NUMERIC,
  time_pattern TEXT,
  start_time TIME,
  end_time TIME,
  days_of_week INTEGER[],
  room TEXT,
  instructor TEXT,
  language TEXT,
  level TEXT,
  remarks TEXT,
  max_capacity INTEGER,
  delivery_mode TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_schedules_term_dept ON schedules(term_code, department);
CREATE INDEX idx_schedules_subject ON schedules(subject_code);
```

### Curriculum Table

```sql
CREATE TABLE curriculum (
  id BIGSERIAL PRIMARY KEY,
  degree_code TEXT NOT NULL,
  year_level INTEGER,
  semester INTEGER,
  course_code TEXT NOT NULL,
  course_description TEXT,
  units NUMERIC,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_curriculum_degree ON curriculum(degree_code);
CREATE INDEX idx_curriculum_course ON curriculum(course_code);
```

## Step 3: Deploy the Edge Function

You'll need to deploy a `github-data-ingest` Edge Function that receives data from the scraper and inserts it into your database.

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Initialize Supabase locally** (in your project directory):
   ```bash
   supabase init
   ```

3. **Create the Edge Function**:
   ```bash
   supabase functions new github-data-ingest
   ```

4. **Implement the function** to handle incoming data and insert it into your tables (refer to Supabase Edge Functions documentation for details).

5. **Deploy the function**:
   ```bash
   supabase functions deploy github-data-ingest
   ```

## Step 4: Generate an API Key

1. Go to your Supabase project dashboard
2. Navigate to **Settings** > **API**
3. Copy your **anon/public** key or create a custom **service role** key for enhanced security
4. This will be your `DATA_INGEST_TOKEN`

## Step 5: Configure GitHub Secrets

In your GitHub repository:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Add the following secrets:
   - `AISIS_USERNAME`: Your AISIS username
   - `AISIS_PASSWORD`: Your AISIS password
   - `DATA_INGEST_TOKEN`: The authentication token from Step 4

## Step 6: Update the Sync URL (if needed)

If your Supabase project URL is different, update it in `src/supabase.js`:

```javascript
this.url = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/github-data-ingest';
```

Replace `YOUR_PROJECT_ID` with your actual Supabase project ID.

## Testing Locally

Before running on GitHub Actions, test the scraper locally:

1. Create a `.env` file with your credentials:
   ```
   AISIS_USERNAME=your_username
   AISIS_PASSWORD=your_password
   DATA_INGEST_TOKEN=your_ingest_token
   ```

2. Run the scraper:
   ```bash
   npm start
   ```

3. Check your Supabase dashboard to verify data was synced correctly

## Troubleshooting

### Data not syncing
- Verify your `DATA_INGEST_TOKEN` is correct
- Check the Edge Function logs in Supabase dashboard
- Ensure your database tables exist and have the correct schema

### Authentication errors
- Verify your AISIS credentials are correct
- Check if AISIS is accessible from your network

### Edge Function errors
- Review the function logs in Supabase dashboard
- Ensure the function is deployed and active
- Verify the API endpoint URL is correct

## Security Best Practices

- **Never commit credentials**: Always use environment variables or GitHub Secrets
- **Use service role keys carefully**: They have full database access
- **Enable Row Level Security (RLS)**: Protect your data with Supabase RLS policies
- **Rotate API keys regularly**: Update keys periodically for security

## What's Next?

Once your Supabase integration is set up:
1. The scraper will run automatically on schedule via GitHub Actions
2. Data will be synced to your Supabase database
3. You can query and use the data in your applications via Supabase client libraries

For more information on Supabase Edge Functions, visit the [official documentation](https://supabase.com/docs/guides/functions).
