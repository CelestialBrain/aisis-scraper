import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Data Pipeline (Current Semester Only)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, AISIS_PASSWORD, DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, SPREADSHEET_ID 
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials.');
    process.exit(1);
  }

  // Fallback term if auto-detection fails (e.g. '2025-1' or '2025-2')
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

    // 1. Scrape Schedule (Current Term)
    const scheduleData = await scraper.scrapeSchedule(CURRENT_TERM_FALLBACK);
    
    // 2. Scrape Curriculum (Always the same)
    const curriculumData = await scraper.scrapeCurriculum();

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // --- PROCESS SCHEDULES ---
    if (scheduleData.length > 0) {
      const cleanSchedule = supabase.transformScheduleData(scheduleData);
      
      // A. Save Local Backup
      fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
      console.log(`   💾 Saved ${scheduleData.length} classes to data/courses.json`);

      // B. Sync to Supabase (Batched by Dept to prevent timeouts)
      if (DATA_INGEST_TOKEN) {
        const byDept = scheduleData.reduce((acc, item) => {
          const d = item.department || 'UNKNOWN';
          if (!acc[d]) acc[d] = [];
          acc[d].push(item);
          return acc;
        }, {});

        for (const dept of Object.keys(byDept)) {
          const batchData = supabase.transformScheduleData(byDept[dept]);
          // Fix array format for Supabase (Postgres needs arrays, Sheets needs strings)
          const supabaseBatch = batchData.map(d => ({
              ...d,
              days_of_week: JSON.parse(d.days_of_week)
          }));
          // Pass the term code found in the data (or fallback)
          const termCode = batchData[0]?.term_code || CURRENT_TERM_FALLBACK;
          await supabase.syncToSupabase('schedules', supabaseBatch, termCode, dept);
        }
      }

      // C. Sync to Google Sheets (Updates the 'Schedules' tab)
      if (sheets) {
        await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
      }
    } else {
      console.warn("   ⚠️ No schedule data found.");
    }

    // --- PROCESS CURRICULUM ---
    if (curriculumData.length > 0) {
      const cleanCurriculum = supabase.transformCurriculumData(curriculumData);

      // A. Save Local Backup
      fs.writeFileSync('data/curriculum.json', JSON.stringify(cleanCurriculum, null, 2));
      console.log(`   💾 Saved ${curriculumData.length} curriculum items`);

      // B. Sync to Supabase
      if (DATA_INGEST_TOKEN) {
        await supabase.syncToSupabase('curriculum', cleanCurriculum);
      }

      // C. Sync to Google Sheets
      if (sheets) {
        await sheets.syncData(SPREADSHEET_ID, 'Curriculum', cleanCurriculum);
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();
