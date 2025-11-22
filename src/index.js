import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';

async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
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
    SPREADSHEET_ID 
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials in environment variables');
    console.error('   Please set AISIS_USERNAME and AISIS_PASSWORD');
    process.exit(1);
  }

  const CURRENT_TERM = '2024-2'; // Updated to match Python script

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
    // Initialize and login
    await scraper.init();
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      throw new Error('Login failed');
    }

    // Scrape schedule data
    console.log('\n📥 Scraping schedule data...');
    const scheduleData = await scraper.scrapeSchedule(CURRENT_TERM);

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    if (scheduleData.length > 0) {
      const cleanSchedule = supabase ? supabase.transformScheduleData(scheduleData) : scheduleData;
      
      // 1. Local backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   💾 Saved ${scheduleData.length} courses to data/courses.json`);

      // 2. Supabase Sync
      if (supabase) {
        console.log('   🚀 Starting Supabase Sync...');
        
        // Group by department for batch processing
        const byDept = scheduleData.reduce((acc, item) => {
          const dept = item.department || 'UNKNOWN';
          if (!acc[dept]) acc[dept] = [];
          acc[dept].push(item);
          return acc;
        }, {});
        
        const departments = Object.keys(byDept);
        let successCount = 0;
        let errorCount = 0;
        
        const results = await runInBatches(departments, 3, async (dept) => {
          try {
            const batchData = supabase.transformScheduleData(byDept[dept]);
            const supabaseBatch = batchData.map(d => ({
              ...d,
              days_of_week: JSON.parse(d.days_of_week)
            }));
            
            const success = await supabase.syncToSupabase('schedules', supabaseBatch, CURRENT_TERM, dept);
            if (success) successCount++; else errorCount++;
            return success;
          } catch (error) {
            console.error(`   ❌ Failed to sync ${dept}:`, error.message);
            errorCount++;
            return false;
          }
        });
        
        console.log(`   📊 Supabase Sync Results: ${successCount} successful, ${errorCount} failed`);
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
      console.warn("   ⚠️ No schedule data found. This might indicate:");
      console.warn("      - No courses available for the current term");
      console.warn("      - Session expired during scraping");
      console.warn("      - AISIS system changes");
    }

    console.log('\n✅ Scraping completed successfully!');
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
  console.error('Uncaught Exception:', error
