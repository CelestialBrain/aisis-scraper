import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import 'dotenv/config';

/**
 * Format milliseconds as seconds with one decimal place
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string (e.g., "12.3s")
 */
function formatTime(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

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
    APPLICABLE_PERIOD,  // Optional override for term (legacy)
    AISIS_TERM          // Optional override for term (preferred)
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials in environment variables');
    console.error('   Please set AISIS_USERNAME and AISIS_PASSWORD');
    process.exit(1);
  }

  // Optional term override from environment variable
  // AISIS_TERM takes precedence over APPLICABLE_PERIOD for clarity
  const termOverride = AISIS_TERM || APPLICABLE_PERIOD || null;
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
    const startTime = Date.now();
    const phaseTimings = {};
    
    console.log('🚀 Initializing scraper...');
    const initStart = Date.now();
    await scraper.init();
    phaseTimings.init = Date.now() - initStart;

    console.log('🔐 Logging in...');
    const loginStart = Date.now();
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      throw new Error('Login failed - check credentials');
    }
    phaseTimings.login = Date.now() - loginStart;
    console.log(`   ⏱  Login & validation: ${formatTime(phaseTimings.login)}`);

    console.log('📥 Scraping schedule data...');
    const scrapeStart = Date.now();
    const scheduleData = await scraper.scrapeSchedule(termOverride);
    phaseTimings.scraping = Date.now() - scrapeStart;
    console.log(`   ⏱  AISIS scraping: ${formatTime(phaseTimings.scraping)}`);
    
    // Get the actual term that was used (either override or auto-detected)
    const usedTerm = scraper.lastUsedTerm;

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    if (scheduleData.length > 0) {
      console.log(`\n💾 Processing ${scheduleData.length} courses from term ${usedTerm}...`);
      
      // Add term_code to each course record before transformation
      const enrichedSchedule = scheduleData.map(course => ({
        ...course,
        term_code: usedTerm
      }));
      
      const cleanSchedule = supabase ? supabase.transformScheduleData(enrichedSchedule) : enrichedSchedule;
      
      // 1. Local backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   ✅ Saved ${scheduleData.length} courses to data/courses.json`);

      // 2. Supabase Sync
      if (supabase) {
        console.log('   🚀 Starting Supabase Sync...');
        const supabaseStart = Date.now();
        
        // Sync all data at once instead of by department
        try {
          const success = await supabase.syncToSupabase('schedules', cleanSchedule, usedTerm, 'ALL');
          phaseTimings.supabase = Date.now() - supabaseStart;
          console.log(`   ⏱  Supabase sync: ${formatTime(phaseTimings.supabase)}`);
          
          if (success) {
            console.log('   ✅ Supabase sync completed successfully');
          } else {
            console.log('   ⚠️ Supabase sync had some failures');
          }
        } catch (error) {
          phaseTimings.supabase = Date.now() - supabaseStart;
          console.error('   ❌ Supabase sync failed:', error.message);
        }
      } else {
        console.log('   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
        phaseTimings.supabase = 0;
      }

      // 3. Google Sheets Sync
      if (sheets) {
        console.log('   📊 Syncing to Google Sheets...');
        const sheetsStart = Date.now();
        try {
          await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
          phaseTimings.sheets = Date.now() - sheetsStart;
          console.log(`   ⏱  Sheets sync: ${formatTime(phaseTimings.sheets)}`);
          console.log('   ✅ Google Sheets sync completed');
        } catch (error) {
          phaseTimings.sheets = Date.now() - sheetsStart;
          console.error('   ❌ Google Sheets sync failed:', error.message);
        }
      } else {
        phaseTimings.sheets = 0;
      }
      
      // Print summary timing
      const totalTime = Date.now() - startTime;
      console.log('\n⏱  Performance Summary:');
      console.log(`   Initialization: ${formatTime(phaseTimings.init)}`);
      console.log(`   Login & validation: ${formatTime(phaseTimings.login)}`);
      console.log(`   AISIS scraping: ${formatTime(phaseTimings.scraping)}`);
      if (phaseTimings.supabase > 0) {
        console.log(`   Supabase sync: ${formatTime(phaseTimings.supabase)}`);
      }
      if (phaseTimings.sheets > 0) {
        console.log(`   Sheets sync: ${formatTime(phaseTimings.sheets)}`);
      }
      console.log(`   Total time: ${formatTime(totalTime)}`);

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
