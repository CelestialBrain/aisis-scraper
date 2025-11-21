import dotenv from 'dotenv';
import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';

// Load environment variables
dotenv.config();

/**
 * Main Execution Pipeline
 * Combines production-grade scraper (v2) with Supabase sync (v1)
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Data Scraper - Production Edition');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Validation
  const { AISIS_USERNAME, AISIS_PASSWORD, SUPABASE_SYNC_KEY } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials. Please set AISIS_USERNAME and AISIS_PASSWORD.');
    process.exit(1);
  }

  if (!SUPABASE_SYNC_KEY) {
    console.error('❌ FATAL: Missing SUPABASE_SYNC_KEY. Please set it in your environment variables.');
    process.exit(1);
  }

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);

  try {
    // 2. Initialization & Login
    await scraper.init();
    await scraper.login();

    // 3. Execution (Targeted Scraping - Only institutional data)
    const scheduleData = await scraper.scrapeSchedule();
    const curriculumData = await scraper.scrapeCurriculum();

    // 4. Supabase Sync
    console.log('\n☁️ Starting Supabase Sync...');
    const supabase = new SupabaseManager(SUPABASE_SYNC_KEY);
    
    // Set the current term (Update this manually when the semester changes)
    const CURRENT_TERM = '20253'; 

    // Sync Schedule Data
    if (scheduleData && scheduleData.length > 0) {
      // Group data by department because Lovable expects per-department sync
      const schedulesByDept = scheduleData.reduce((acc, item) => {
        const dept = item.department || 'UNKNOWN';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(item);
        return acc;
      }, {});

      const departments = Object.keys(schedulesByDept);
      console.log(`   Found ${departments.length} departments to sync.`);

      for (const dept of departments) {
        const formattedData = supabase.transformScheduleData(schedulesByDept[dept]);
        await supabase.syncToSupabase('schedules', formattedData, CURRENT_TERM, dept);
      }
    } else {
      console.log("   ⚠️ No schedule data found to sync.");
    }

    // Sync Curriculum Data
    if (curriculumData && curriculumData.length > 0) {
      const formattedCurriculum = supabase.transformCurriculumData(curriculumData);
      await supabase.syncToSupabase('curriculum', formattedCurriculum);
      console.log(`   ✅ Successfully synced ${formattedCurriculum.length} curriculum items`);
    } else {
      console.log("   ⚠️ No curriculum data found to sync.");
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ AISIS Data Scraper - Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════');
    console.error('❌ AISIS Data Scraper - Failed!');
    console.error('═══════════════════════════════════════════════════════');
    console.error('\nError:', error.message);
    console.error('\nStack trace:', error.stack);
    console.error('');
    
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main();
