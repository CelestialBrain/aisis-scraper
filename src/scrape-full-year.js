#!/usr/bin/env node
/**
 * Full Academic Year Schedule Scraper
 * 
 * This script scrapes class schedules for all three semesters of a given academic year:
 * - Intersession (YYYY-0)
 * - First Semester (YYYY-1)
 * - Second Semester (YYYY-2)
 * 
 * Usage:
 *   node src/scrape-full-year.js [year]
 *   
 * Examples:
 *   node src/scrape-full-year.js 2025       # Scrape 2025-0, 2025-1, 2025-2
 *   TARGET_YEAR=2025 node src/scrape-full-year.js
 * 
 * Environment Variables:
 *   AISIS_USERNAME - Required: AISIS login username
 *   AISIS_PASSWORD - Required: AISIS login password
 *   TARGET_YEAR    - Target academic year (can also be passed as first argument)
 *   DATA_INGEST_TOKEN - Optional: Supabase ingest token for sync
 *   GOOGLE_SERVICE_ACCOUNT - Optional: Google Sheets service account (base64)
 *   SPREADSHEET_ID - Optional: Google Sheets spreadsheet ID
 * 
 * Output:
 *   - logs/schedule-all-terms-{year}.json - Aggregated results for all terms
 *   - data/courses.json - Flat array of all courses (for backward compat)
 */

import fs from 'fs';
import { AISISScraper } from './scraper.js';
import { SupabaseManager, chunkArray, processWithConcurrency, ALL_DEPARTMENTS_LABEL } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import { BaselineManager } from './baseline.js';
import 'dotenv/config';

/**
 * Format milliseconds as seconds with one decimal place
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string (e.g., "12.3s")
 */
function formatTime(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Valid year range for academic year input
const MIN_VALID_YEAR = 2000;
const MAX_VALID_YEAR = 2100;

/**
 * Generate term codes for a full academic year
 * 
 * Term codes follow the format YYYY-S where:
 * - YYYY is the academic year
 * - S is the semester:
 *   - 0 = Intersession
 *   - 1 = First Semester
 *   - 2 = Second Semester
 * 
 * @param {number|string} year - Academic year (e.g., 2025)
 * @returns {string[]} Array of term codes [YYYY-0, YYYY-1, YYYY-2]
 * 
 * @example
 * generateYearTerms(2025)  // returns ['2025-0', '2025-1', '2025-2']
 */
function generateYearTerms(year) {
  const y = String(year);
  return [`${y}-0`, `${y}-1`, `${y}-2`];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Full Academic Year Schedule Scraper');
  console.log('═══════════════════════════════════════════════════════\n');

  const { 
    AISIS_USERNAME, 
    AISIS_PASSWORD, 
    DATA_INGEST_TOKEN, 
    GOOGLE_SERVICE_ACCOUNT, 
    SPREADSHEET_ID,
    TARGET_YEAR
  } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ FATAL: Missing AISIS credentials in environment variables');
    console.error('   Please set AISIS_USERNAME and AISIS_PASSWORD');
    process.exit(1);
  }

  // Get target year from command line argument or environment variable
  // Command line takes precedence over environment variable
  const cmdLineYear = process.argv[2];
  const yearInput = cmdLineYear || TARGET_YEAR;
  
  // Default to current calendar year if not specified
  const defaultYear = new Date().getFullYear();
  const targetYear = yearInput ? parseInt(yearInput, 10) : defaultYear;
  
  if (!yearInput) {
    console.log(`   ℹ️ No target year specified, defaulting to current year: ${defaultYear}`);
    console.log('   💡 Tip: Pass year as argument or set TARGET_YEAR environment variable\n');
  }
  
  if (isNaN(targetYear) || targetYear < MIN_VALID_YEAR || targetYear > MAX_VALID_YEAR) {
    console.error(`❌ FATAL: Invalid target year: ${yearInput}`);
    console.error(`   Please provide a valid year between ${MIN_VALID_YEAR} and ${MAX_VALID_YEAR} (e.g., 2025)`);
    process.exit(1);
  }
  
  const termsToScrape = generateYearTerms(targetYear);
  console.log(`📅 Target academic year: ${targetYear}`);
  console.log(`   Terms to scrape: ${termsToScrape.join(', ')}\n`);

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

    // Scrape all terms in the academic year
    console.log('\n📥 Scraping schedule data (full academic year mode)...');
    const scrapeStart = Date.now();
    const multiTermResults = await scraper.scrapeMultipleTerms(termsToScrape);
    phaseTimings.scraping = Date.now() - scrapeStart;
    console.log(`   ⏱  AISIS scraping: ${formatTime(phaseTimings.scraping)}`);

    // Process and save results
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // Build aggregated results
    const allTermsData = [];
    let totalCourses = 0;
    
    for (const termResult of multiTermResults) {
      const { term, courses: scheduleData, departments: deptResults, error } = termResult;
      
      if (error) {
        console.warn(`\n⚠️ Term ${term} scrape failed: ${error}`);
        allTermsData.push({
          term,
          course_count: 0,
          error,
          departments: []
        });
        continue;
      }
      
      if (scheduleData.length === 0) {
        console.warn(`\n⚠️ No schedule data found for term ${term}.`);
        allTermsData.push({
          term,
          course_count: 0,
          departments: []
        });
        continue;
      }
      
      console.log(`\n💾 Processing ${scheduleData.length} courses from term ${term}...`);
      totalCourses += scheduleData.length;
      
      // Add term_code to each course record
      const enrichedSchedule = scheduleData.map(course => ({
        ...course,
        term_code: term
      }));
      
      const cleanSchedule = supabase ? supabase.transformScheduleData(enrichedSchedule) : enrichedSchedule;
      
      allTermsData.push({
        term,
        course_count: cleanSchedule.length,
        courses: cleanSchedule,
        departments: deptResults.map(({ department, courses }) => ({
          department,
          course_count: courses.length
        }))
      });
    }

    // Initialize baseline manager for regression detection
    const baselineManager = new BaselineManager();
    const baselineConfig = baselineManager.getConfigSummary();
    console.log(`\n🔍 Baseline tracking enabled:`);
    console.log(`   Drop threshold: ${baselineConfig.dropThresholdPercent}%`);
    console.log(`   Warn-only mode: ${baselineConfig.warnOnly ? 'Yes' : 'No (will fail on regression)'}`);

    // Process baseline comparison for each term
    let regressionFailed = false;
    
    for (const termData of allTermsData) {
      if (!termData.courses || termData.courses.length === 0) {
        continue;
      }
      
      const { term, courses: scheduleData } = termData;
      
      // Extract per-department counts for detailed analysis
      const deptCounts = {};
      for (const course of scheduleData) {
        const dept = course.department || 'UNKNOWN';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      }
      
      // Compare with previous baseline
      const comparisonResult = baselineManager.compareWithBaseline(
        term,
        scheduleData.length,
        deptCounts
      );
      
      // Record new baseline for future comparisons
      baselineManager.recordBaseline(term, scheduleData.length, deptCounts, {
        scrapeTime: phaseTimings.scraping,
        departmentCount: Object.keys(deptCounts).length,
        academicYear: targetYear
      });
      
      // Check if we should fail the job due to regression
      if (baselineManager.shouldFailJob(comparisonResult)) {
        console.error(`\n❌ REGRESSION DETECTED for term ${term}: Total record count dropped significantly`);
        console.error(`   This likely indicates data loss during scraping`);
        console.error(`   Set BASELINE_WARN_ONLY=true to make this a warning instead of failure`);
        regressionFailed = true;
      }
    }

    // Common metadata for output files
    const scrapedAt = new Date().toISOString();
    
    // Save aggregated results to logs (summary only, no courses)
    const aggregatedResult = {
      academic_year: targetYear,
      terms: termsToScrape,
      scraped_at: scrapedAt,
      total_courses: totalCourses,
      term_results: allTermsData.map(t => ({
        term: t.term,
        course_count: t.course_count,
        error: t.error || null,
        department_count: t.departments ? t.departments.length : 0
      }))
    };
    
    const logsPath = `logs/schedule-all-terms-${targetYear}.json`;
    fs.writeFileSync(logsPath, JSON.stringify(aggregatedResult, null, 2));
    console.log(`\n📁 Saved aggregated summary to ${logsPath}`);

    // Save all courses to data directory (flat array)
    const allCourses = allTermsData.flatMap(t => t.courses || []);
    fs.writeFileSync('data/courses.json', JSON.stringify(allCourses, null, 2));
    console.log(`   ✅ Saved ${allCourses.length} total courses to data/courses.json`);

    // Save full per-term breakdown (includes courses)
    const fullDataPath = `data/schedules-full-year-${targetYear}.json`;
    fs.writeFileSync(fullDataPath, JSON.stringify({
      academic_year: targetYear,
      scraped_at: scrapedAt,
      total_courses: totalCourses,
      terms: allTermsData
    }, null, 2));
    console.log(`   ✅ Saved full breakdown to ${fullDataPath}`);

    // Supabase Sync (optional)
    if (supabase && allCourses.length > 0) {
      console.log('\n🚀 Starting Supabase Sync...');
      
      const supabaseStart = Date.now();
      
      // Parse configuration from environment
      const SCHEDULE_SEND_CONCURRENCY = parseInt(process.env.SCHEDULE_SEND_CONCURRENCY || '2', 10);
      const SUPABASE_CLIENT_BATCH_SIZE = parseInt(process.env.SUPABASE_CLIENT_BATCH_SIZE || '2000', 10);
      
      console.log(`   Configuration: batch_size=${SUPABASE_CLIENT_BATCH_SIZE}, concurrency=${SCHEDULE_SEND_CONCURRENCY}`);
      
      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      
      // Process each term separately to maintain term isolation in Supabase
      for (const termData of allTermsData) {
        if (!termData.courses || termData.courses.length === 0) {
          continue;
        }
        
        const { term, courses: termCourses } = termData;
        console.log(`\n   📅 Syncing term: ${term}`);
        
        // Batch courses for this term
        const scheduleBatches = chunkArray(termCourses, SUPABASE_CLIENT_BATCH_SIZE);
        console.log(`   Batched ${termCourses.length} course(s) into ${scheduleBatches.length} batch(es)`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Process batches with concurrency control
        await processWithConcurrency(
          scheduleBatches,
          SCHEDULE_SEND_CONCURRENCY,
          async (batch, batchIndex) => {
            const totalBatchIndex = batchIndex + 1;
            console.log(`      📤 [${totalBatchIndex}/${scheduleBatches.length}] Sending schedule batch: records=${batch.length}`);
            
            try {
              await supabase.syncToSupabase('schedules', batch, term, ALL_DEPARTMENTS_LABEL);
              successCount += batch.length;
              console.log(`      ✅ [${totalBatchIndex}/${scheduleBatches.length}]: Batch sent successfully`);
              return true;
            } catch (err) {
              failureCount += batch.length;
              console.error(`      ❌ [${totalBatchIndex}/${scheduleBatches.length}]: Failed to send batch`);
              console.error(`         Error: ${err.message}`);
              return false;
            }
          }
        );
        
        totalSuccessCount += successCount;
        totalFailureCount += failureCount;
        
        console.log(`   ✅ Term ${term} sync complete: ${successCount} successful, ${failureCount} failed`);
      }
      
      phaseTimings.supabase = Date.now() - supabaseStart;
      
      console.log('\n✅ SCHEDULE SUPABASE SYNC COMPLETE', {
        total_terms: allTermsData.filter(t => t.courses && t.courses.length > 0).length,
        successful_records: totalSuccessCount,
        failed_records: totalFailureCount,
        duration_ms: phaseTimings.supabase
      });
      console.log(`   ⏱  Supabase sync: ${formatTime(phaseTimings.supabase)}`);
    } else if (!supabase) {
      console.log('\n   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
      phaseTimings.supabase = 0;
    }

    // Google Sheets Sync (optional)
    if (sheets && allCourses.length > 0) {
      console.log('\n📊 Syncing to Google Sheets...');
      const sheetsStart = Date.now();
      try {
        // Multi-term mode: create one tab per term
        for (const termData of allTermsData) {
          if (!termData.courses || termData.courses.length === 0) {
            continue;
          }
          const tabName = termData.term;
          await sheets.syncData(SPREADSHEET_ID, tabName, termData.courses);
          console.log(`   ✅ Synced ${termData.courses.length} courses to tab: ${tabName}`);
        }
        console.log(`   ✅ Google Sheets sync completed`);
        phaseTimings.sheets = Date.now() - sheetsStart;
        console.log(`   ⏱  Sheets sync: ${formatTime(phaseTimings.sheets)}`);
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

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`✅ Full Academic Year ${targetYear} scraping completed!`);
    console.log(`   Total courses scraped: ${totalCourses}`);
    console.log(`   Terms: ${termsToScrape.join(', ')}`);
    console.log('═══════════════════════════════════════════════════════');
    
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
