import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Schedule Scraper (Supabase + Sheets)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, AISIS_PASSWORD, DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, SPREADSHEET_ID 
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials.');
    process.exit(1);
  }

  // Fallback Term (Will auto-detect if possible)
  const CURRENT_TERM_FALLBACK = '2025-1'; 

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
  const supabase = new SupabaseManager(DATA_INGEST_TOKEN);
  
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
    await scraper.init();
    await scraper.login();

    // Only Scrape Schedule
    const scheduleData = await scraper.scrapeSchedule(CURRENT_TERM_FALLBACK);

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // --- PROCESS SCHEDULES ---
    if (scheduleData.length > 0) {
      // 1. Clean Data
      const cleanSchedule = supabase.transformScheduleData(scheduleData);
      
      // 2. Save Local Backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   💾 Saved ${scheduleData.length} classes to data/courses.json`);

      // 3. Sync to Supabase (Batched by Dept)
      if (DATA_INGEST_TOKEN) {
        const byDept = scheduleData.reduce((acc, item) => {
          const d = item.department || 'UNKNOWN';
          if (!acc[d]) acc[d] = [];
          acc[d].push(item);
          return acc;
        }, {});

        for (const dept of Object.keys(byDept)) {
          const batchData = supabase.transformScheduleData(byDept[dept]);
          // Fix array format for Supabase
          const supabaseBatch = batchData.map(d => ({
              ...d,
              days_of_week: JSON.parse(d.days_of_week)
          }));
          await supabase.syncToSupabase('schedules', supabaseBatch, CURRENT_TERM_FALLBACK, dept);
        }
      }

      // 4. Sync to Google Sheets (All at once)
      if (sheets) {
        await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
      }
    } else {
      console.warn("   ⚠️ No schedule data found (Term might be empty).");
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();
