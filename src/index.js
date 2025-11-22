import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import 'dotenv/config';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Schedule Scraper');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, 
    AISIS_PASSWORD, 
    DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, 
    SPREADSHEET_ID,
    APPLICABLE_PERIOD  // Optional override for term
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials in environment variables');
    console.error('   Please set AISIS_USERNAME and AISIS_PASSWORD');
    process.exit(1);
  }

  // Optional term override from environment variable
  const termOverride = APPLICABLE_PERIOD || null;
  if (termOverride) {
    console.log(`   📌 Term override from environment: ${termOverride}`);
  } else {
    console.log('   🔍 Term will be auto-detected from AISIS');
  }

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
  const supabase = DATA_INGEST_TOKEN ? new SupabaseManager(DATA_INGEST_TOKEN) : null;
  
  let sheets = null;
  if (GOOGLE_SERVICE_ACCOUNT && SPREADSHEET_ID) {
    try {
      sheets = new GoogleSheetsManager(GOOGLE_SERVICE_ACCOUNT);
      console.log('   ✅ Google Sheets Enabled');
    } catch (e) {
      console.warn('   ⚠️ Google Sheets Init Failed:', e.message);
    }
  }

  try {
    console.log('🚀 Initializing scraper...');
    await scraper.init();

    console.log('🔐 Logging in...');
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      throw new Error('Login failed - check credentials');
    }

    console.log('📥 Scraping schedule data...');
    const scheduleData = await scraper.scrapeSchedule(termOverride);
    
    // Get the actual term that was used (either override or auto-detected)
    const usedTerm = scraper.lastUsedTerm;

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    if (scheduleData.length > 0) {
      console.log(`\n💾 Processing ${scheduleData.length} courses from term ${usedTerm}...`);
      
      const cleanSchedule = supabase ? supabase.transformScheduleData(scheduleData) : scheduleData;
      
      // 1. Local backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   ✅ Saved ${scheduleData.length} courses to data/courses.json`);

      // 2. Supabase Sync
      if (supabase) {
        console.log('   🚀 Starting Supabase Sync...');
        
        // Sync all data at once instead of by department
        try {
          const success = await supabase.syncToSupabase('schedules', cleanSchedule, usedTerm, 'ALL');
          if (success) {
            console.log('   ✅ Supabase sync completed successfully');
          } else {
            console.log('   ⚠️ Supabase sync had some failures');
          }
        } catch (error) {
          console.error('   ❌ Supabase sync failed:', error.message);
        }
      } else {
        console.log('   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
      }

      // 3. Google Sheets Sync
      if (sheets) {
        console.log('   📊 Syncing to Google Sheets...');
        try {
          await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
          console.log('   ✅ Google Sheets sync completed');
        } catch (error) {
          console.error('   ❌ Google Sheets sync failed:', error.message);
        }
      }

    } else {
      console.warn(`\n⚠️ No schedule data found for term ${usedTerm}.`);
      console.log("   This could be because:");
      console.log("   - No courses are available for this term");
      console.log("   - The term has not been published yet in AISIS");
      console.log("   - The session expired during scraping");
      console.log("   - There are issues with the AISIS system");
      console.log(`   - Try setting APPLICABLE_PERIOD env variable to override term`);
    }

    console.log('\n✅ Scraping completed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Scraping failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();
