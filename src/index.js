import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import { BaselineManager } from './baseline.js';
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
    const scrapeResult = await scraper.scrapeSchedule(termOverride);
    phaseTimings.scraping = Date.now() - scrapeStart;
    console.log(`   ⏱  AISIS scraping: ${formatTime(phaseTimings.scraping)}`);
    
    // Extract structured results from new return shape
    const { term: resolvedTerm, courses: scheduleData, departments: deptResults } = scrapeResult;
    
    // Get the actual term that was used (either override or auto-detected)
    const usedTerm = resolvedTerm;
    
    // Initialize baseline manager for regression detection
    const baselineManager = new BaselineManager();
    const baselineConfig = baselineManager.getConfigSummary();
    console.log(`\n🔍 Baseline tracking enabled:`);
    console.log(`   Drop threshold: ${baselineConfig.dropThresholdPercent}%`);
    console.log(`   Warn-only mode: ${baselineConfig.warnOnly ? 'Yes' : 'No (will fail on regression)'}`);

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
      
      // Save per-department structure for debugging and analysis
      const perDeptArtifact = {
        term: usedTerm,
        departments: deptResults.map(({ department, courses }) => ({
          department,
          course_count: courses.length,
          courses: courses.map(c => ({ ...c, term_code: usedTerm }))
        }))
      };
      fs.writeFileSync('data/schedules-per-department.json', JSON.stringify(perDeptArtifact, null, 2));
      console.log(`   ✅ Saved per-department structure to data/schedules-per-department.json`);

      // 2. Baseline comparison and regression detection
      // NOTE: We check for regression BEFORE syncing to Supabase
      // This allows us to detect data loss issues early and decide whether to proceed
      // The baseline is still recorded even if we decide not to sync bad data
      
      // Extract per-department counts for detailed analysis
      const deptCounts = {};
      for (const course of scheduleData) {
        const dept = course.department || 'UNKNOWN';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      }
      
      // Compare with previous baseline
      const comparisonResult = baselineManager.compareWithBaseline(
        usedTerm,
        scheduleData.length,
        deptCounts
      );
      
      // Record new baseline for future comparisons
      // This happens regardless of regression detection to maintain continuity
      baselineManager.recordBaseline(usedTerm, scheduleData.length, deptCounts, {
        scrapeTime: phaseTimings.scraping,
        departmentCount: Object.keys(deptCounts).length
      });
      
      // Check if we should fail the job due to regression
      let regressionFailed = false;
      if (baselineManager.shouldFailJob(comparisonResult)) {
        console.error(`\n❌ REGRESSION DETECTED: Total record count dropped significantly`);
        console.error(`   This likely indicates data loss during scraping`);
        console.error(`   Set BASELINE_WARN_ONLY=true to make this a warning instead of failure`);
        regressionFailed = true;
      }

      // 3. Supabase Sync - Per-Department Batching (mirroring curriculum per-program approach)
      if (supabase) {
        console.log('\n🚀 Starting Supabase Sync (Per-Department Batching)...');
        console.log(`   Sending ${deptResults.length} batch(es), one per department\n`);
        
        const supabaseStart = Date.now();
        let successCount = 0;
        let failureCount = 0;
        
        // Pre-transform all courses once to avoid repeated processing in the loop
        const allEnrichedCourses = scheduleData.map(c => ({ ...c, term_code: usedTerm }));
        const allCleanCourses = supabase.transformScheduleData(allEnrichedCourses);
        
        // Build department-to-courses map for efficient lookup
        const deptCoursesMap = new Map();
        for (const course of allCleanCourses) {
          const dept = course.department;
          if (!deptCoursesMap.has(dept)) {
            deptCoursesMap.set(dept, []);
          }
          deptCoursesMap.get(dept).push(course);
        }
        
        // Process each department separately
        for (const { department } of deptResults) {
          const cleanCourses = deptCoursesMap.get(department) || [];
          
          console.log(`   📤 Sending batch for ${department}...`);
          console.log(`      Department: ${department}`);
          console.log(`      Courses: ${cleanCourses.length}`);
          
          try {
            // Sync this department's courses
            await supabase.syncToSupabase('schedules', cleanCourses, usedTerm, department);
            successCount++;
            console.log(`   ✅ ${department}: Batch sent successfully`);
          } catch (err) {
            failureCount++;
            console.error(`   ❌ ${department}: Failed to send batch`, { error: err.message });
          }
        }
        
        phaseTimings.supabase = Date.now() - supabaseStart;
        
        // Final summary log
        console.log('\n✅ SCHEDULE SUPABASE SYNC COMPLETE', {
          term: usedTerm,
          departments_total: deptResults.length,
          successful: successCount,
          failed: failureCount,
          duration_ms: phaseTimings.supabase
        });
        console.log(`   ⏱  Supabase sync: ${formatTime(phaseTimings.supabase)}`);
      } else {
        console.log('   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
        phaseTimings.supabase = 0;
      }

      // 4. Google Sheets Sync
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
      
      // Exit with error if regression detected and not in warn-only mode
      if (regressionFailed) {
        console.log('\n❌ Scraping completed with REGRESSION ERROR!');
        process.exit(1);
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

    console.log('\n✅ Schedule scraping completed!');
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
