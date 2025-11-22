import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Schedule Scraper (Schedule Only)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, AISIS_PASSWORD, DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, SPREADSHEET_ID 
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing credentials.');
    process.exit(1);
  }

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

    // 1. SCRAPE SCHEDULE ONLY
    const scheduleData = await scraper.scrapeSchedule(CURRENT_TERM_FALLBACK);

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // --- PROCESS SCHEDULES ---
    if (scheduleData.length > 0) {
      const cleanSchedule = supabase.transformScheduleData(scheduleData);
      
      // 1. Local Backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   💾 Saved ${scheduleData.length} classes to data/courses.json`);

      // 2. Supabase Sync (Parallel Batches)
      if (DATA_INGEST_TOKEN) {
        console.log('   🚀 Starting Parallel Supabase Sync...');
        
        const byDept = scheduleData.reduce((acc, item) => {
          const d = item.department || 'UNKNOWN';
          if (!acc[d]) acc[d] = [];
          acc[d].push(item);
          return acc;
        }, {});
        
        const departments = Object.keys(byDept);
        
        await runInBatches(departments, 5, async (dept) => {
          const batchData = supabase.transformScheduleData(byDept[dept]);
          const supabaseBatch = batchData.map(d => ({
              ...d,
              days_of_week: JSON.parse(d.days_of_week)
          }));
          const termCode = batchData[0]?.term_code || CURRENT_TERM_FALLBACK;
          await supabase.syncToSupabase('schedules', supabaseBatch, termCode, dept);
        });
      }

      // 3. Google Sheets Sync
      if (sheets) {
        await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
      }
    } else {
      console.warn("   ⚠️ No schedule data found.");
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();
