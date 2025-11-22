import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Data Pipeline (Supabase + Google Sheets)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, AISIS_PASSWORD, DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, SPREADSHEET_ID 
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD || !DATA_INGEST_TOKEN) {
    console.error('❌ FATAL: Missing AISIS credentials.');
    process.exit(1);
  }

  const CURRENT_TERM = '2025-1'; 

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

    const rawSchedule = await scraper.scrapeSchedule(CURRENT_TERM);
    const rawCurriculum = await scraper.scrapeCurriculum();

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // --- SCHEDULE ---
    if (rawSchedule.length > 0) {
      const cleanSchedule = supabase.transformScheduleData(rawSchedule);
      
      // 1. Save Local
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));

      // 2. Sync Supabase (Batched)
      const byDept = rawSchedule.reduce((acc, item) => {
        const d = item.department || 'UNKNOWN';
        if (!acc[d]) acc[d] = [];
        acc[d].push(item);
        return acc;
      }, {});

      for (const dept of Object.keys(byDept)) {
        const batchData = supabase.transformScheduleData(byDept[dept]);
        // Convert stringified array back to array for Supabase
        const supabaseBatch = batchData.map(d => ({
            ...d,
            days_of_week: JSON.parse(d.days_of_week)
        }));
        await supabase.syncToSupabase('schedules', supabaseBatch, CURRENT_TERM, dept);
      }

      // 3. Sync Sheets
      if (sheets) await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
    }

    // --- CURRICULUM ---
    if (rawCurriculum.length > 0) {
      const cleanCurriculum = supabase.transformCurriculumData(rawCurriculum);

      // 1. Save Local
      fs.writeFileSync('data/curriculum.json', JSON.stringify(cleanCurriculum, null, 2));

      // 2. Sync Supabase
      await supabase.syncToSupabase('curriculum', cleanCurriculum);

      // 3. Sync Sheets
      if (sheets) await sheets.syncData(SPREADSHEET_ID, 'Curriculum', cleanCurriculum);
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();
