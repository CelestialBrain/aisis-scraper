import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Data Scraper - Production Edition (Fast Mode)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { AISIS_USERNAME, AISIS_PASSWORD, DATA_INGEST_TOKEN } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD || !DATA_INGEST_TOKEN) {
    console.error('❌ FATAL: Missing credentials in .env file.');
    process.exit(1);
  }

  // ✅ FIX: Correct Term Format (Matches HAR file)
  const CURRENT_TERM = '2025-1'; 

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
  const supabase = new SupabaseManager(DATA_INGEST_TOKEN);

  try {
    await scraper.init();
    await scraper.login();

    // ✅ FIX: Pass the term variable to the scraper
    const scheduleData = await scraper.scrapeSchedule(CURRENT_TERM);
    const curriculumData = await scraper.scrapeCurriculum();

    // ✅ FIX: Ensure directory exists
    if (!fs.existsSync('data')) fs.mkdirSync('data');
    
    // Process Schedule
    if (scheduleData.length > 0) {
      fs.writeFileSync('data/courses.json', JSON.stringify(scheduleData, null, 2));
      console.log(`   💾 Saved ${scheduleData.length} classes to data/courses.json`);
      
      const schedulesByDept = scheduleData.reduce((acc, item) => {
        const dept = item.department || 'UNKNOWN';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(item);
        return acc;
      }, {});

      for (const dept of Object.keys(schedulesByDept)) {
        const formattedData = supabase.transformScheduleData(schedulesByDept[dept]);
        await supabase.syncToSupabase('schedules', formattedData, CURRENT_TERM, dept);
      }
    } else {
      console.warn("   ⚠️ No schedule data found to sync.");
    }

    // Process Curriculum
    if (curriculumData.length > 0) {
      fs.writeFileSync('data/curriculum.json', JSON.stringify(curriculumData, null, 2));
      console.log(`   💾 Saved ${curriculumData.length} curriculum items to data/curriculum.json`);
      
      // ✅ FIX: Sync Curriculum to Supabase
      const formattedCurr = supabase.transformCurriculumData(curriculumData);
      await supabase.syncToSupabase('curriculum', formattedCurr);
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();
