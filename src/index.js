import { AISISScraper, compareTermCodes } from './scraper.js';
import { SupabaseManager, chunkArray, processWithConcurrency, ALL_DEPARTMENTS_LABEL } from './supabase.js';
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

    // Determine scraping mode
    // 'current' (default) - scrape only current term
    // 'future' - scrape only future terms (after current)
    // 'all' - scrape both current and future terms
    const scrapeMode = process.env.AISIS_SCRAPE_MODE || 'current';
    console.log(`\n📋 Scrape mode: ${scrapeMode}`);
    
    let termsToScrape = [];
    let multiTermResults = [];
    
    if (scrapeMode === 'current') {
      // Single-term mode (existing behavior)
      console.log('📥 Scraping schedule data (current term only)...');
      const scrapeStart = Date.now();
      const scrapeResult = await scraper.scrapeSchedule(termOverride);
      phaseTimings.scraping = Date.now() - scrapeStart;
      console.log(`   ⏱  AISIS scraping: ${formatTime(phaseTimings.scraping)}`);
      
      // Wrap in array for unified processing
      multiTermResults = [scrapeResult];
    } else {
      // Multi-term mode (future or all)
      console.log('🔍 Discovering available terms...');
      const termsDiscoveryStart = Date.now();
      const availableTerms = await scraper.getAvailableTerms();
      phaseTimings.termDiscovery = Date.now() - termsDiscoveryStart;
      console.log(`   ⏱  Term discovery: ${formatTime(phaseTimings.termDiscovery)}`);
      
      // Find current term
      const currentTermObj = availableTerms.find(t => t.selected) || availableTerms[0];
      const currentTerm = currentTermObj ? currentTermObj.value : null;
      
      if (!currentTerm) {
        throw new Error('Could not determine current term from available terms');
      }
      
      console.log(`   📌 Current term: ${currentTerm} (${currentTermObj.label})`);
      
      // Filter terms based on mode
      if (scrapeMode === 'future') {
        termsToScrape = availableTerms
          .filter(t => compareTermCodes(t.value, currentTerm) > 0)
          .map(t => t.value)
          .sort(compareTermCodes);
        console.log(`   🔮 Future terms to scrape: ${termsToScrape.join(', ')}`);
      } else if (scrapeMode === 'all') {
        termsToScrape = availableTerms
          .filter(t => compareTermCodes(t.value, currentTerm) >= 0)
          .map(t => t.value)
          .sort(compareTermCodes);
        console.log(`   📅 All terms to scrape (current + future): ${termsToScrape.join(', ')}`);
      } else {
        throw new Error(`Invalid AISIS_SCRAPE_MODE: ${scrapeMode}. Valid values: current, future, all`);
      }
      
      if (termsToScrape.length === 0) {
        console.warn(`   ⚠️ No terms to scrape based on mode '${scrapeMode}'`);
        console.log('\n✅ No schedule data to process');
        process.exit(0);
      }
      
      // Scrape multiple terms
      console.log('📥 Scraping schedule data (multi-term mode)...');
      const scrapeStart = Date.now();
      multiTermResults = await scraper.scrapeMultipleTerms(termsToScrape);
      phaseTimings.scraping = Date.now() - scrapeStart;
      console.log(`   ⏱  AISIS scraping: ${formatTime(phaseTimings.scraping)}`);
    }
    
    // Process results for each term
    // For backward compatibility, if single term, extract to old variables
    const { term: resolvedTerm, courses: scheduleData, departments: deptResults } = multiTermResults[0];
    
    // Get the actual term that was used (either override or auto-detected)
    const usedTerm = resolvedTerm;
    
    // Initialize baseline manager for regression detection
    const baselineManager = new BaselineManager();
    const baselineConfig = baselineManager.getConfigSummary();
    console.log(`\n🔍 Baseline tracking enabled:`);
    console.log(`   Drop threshold: ${baselineConfig.dropThresholdPercent}%`);
    console.log(`   Warn-only mode: ${baselineConfig.warnOnly ? 'Yes' : 'No (will fail on regression)'}`);

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // Process each term's data
    let regressionFailed = false;
    const allTermsData = [];
    
    for (const termResult of multiTermResults) {
      const { term, courses: scheduleData, departments: deptResults } = termResult;
      
      if (scheduleData.length === 0) {
        console.warn(`\n⚠️ No schedule data found for term ${term}.`);
        continue;
      }
      
      console.log(`\n💾 Processing ${scheduleData.length} courses from term ${term}...`);
      
      // Add term_code to each course record before transformation
      const enrichedSchedule = scheduleData.map(course => ({
        ...course,
        term_code: term
      }));
      
      const cleanSchedule = supabase ? supabase.transformScheduleData(enrichedSchedule) : enrichedSchedule;
      
      // Store for later use (Sheets and local backup)
      allTermsData.push({
        term,
        scheduleData,
        deptResults,
        cleanSchedule
      });
      
      // 1. Baseline comparison and regression detection (per term)
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
        term,
        scheduleData.length,
        deptCounts
      );
      
      // Record new baseline for future comparisons
      // This happens regardless of regression detection to maintain continuity
      baselineManager.recordBaseline(term, scheduleData.length, deptCounts, {
        scrapeTime: phaseTimings.scraping,
        departmentCount: Object.keys(deptCounts).length
      });
      
      // Check if we should fail the job due to regression
      if (baselineManager.shouldFailJob(comparisonResult)) {
        console.error(`\n❌ REGRESSION DETECTED for term ${term}: Total record count dropped significantly`);
        console.error(`   This likely indicates data loss during scraping`);
        console.error(`   Set BASELINE_WARN_ONLY=true to make this a warning instead of failure`);
        regressionFailed = true;
      }
    }
    
    // Save local backups (combined for all terms in multi-term mode)
    if (allTermsData.length > 0) {
      if (multiTermResults.length === 1) {
        // Single-term mode: use legacy format
        const { cleanSchedule, term, deptResults } = allTermsData[0];
        
        fs.writeFileSync('data/courses.json', JSON.stringify(cleanSchedule, null, 2));
        console.log(`\n📁 Saved ${cleanSchedule.length} courses to data/courses.json`);
        
        // Save per-department structure for debugging and analysis
        const perDeptArtifact = {
          term: term,
          departments: deptResults.map(({ department, courses }) => ({
            department,
            course_count: courses.length,
            courses: courses.map(c => ({ ...c, term_code: term }))
          }))
        };
        fs.writeFileSync('data/schedules-per-department.json', JSON.stringify(perDeptArtifact, null, 2));
        console.log(`   ✅ Saved per-department structure to data/schedules-per-department.json`);
      } else {
        // Multi-term mode: save per-term files
        const allCourses = [];
        const multiTermArtifact = {
          terms: []
        };
        
        for (const { term, cleanSchedule, deptResults } of allTermsData) {
          allCourses.push(...cleanSchedule);
          
          multiTermArtifact.terms.push({
            term: term,
            course_count: cleanSchedule.length,
            departments: deptResults.map(({ department, courses }) => ({
              department,
              course_count: courses.length,
              courses: courses.map(c => ({ ...c, term_code: term }))
            }))
          });
        }
        
        fs.writeFileSync('data/courses.json', JSON.stringify(allCourses, null, 2));
        console.log(`\n📁 Saved ${allCourses.length} total courses to data/courses.json`);
        
        fs.writeFileSync('data/schedules-per-department.json', JSON.stringify(multiTermArtifact, null, 2));
        console.log(`   ✅ Saved multi-term per-department structure to data/schedules-per-department.json`);
      }
    }

    // 2. Supabase Sync - OPTIMIZED WITH BATCHING AND CONCURRENCY
    if (supabase && allTermsData.length > 0) {
      console.log('\n🚀 Starting Supabase Sync (Optimized with Batching and Concurrency)...');
      
      const supabaseStart = Date.now();
      
      // Parse configuration from environment
      const SCHEDULE_SEND_CONCURRENCY = parseInt(process.env.SCHEDULE_SEND_CONCURRENCY || '2', 10);
      const SUPABASE_CLIENT_BATCH_SIZE = parseInt(process.env.SUPABASE_CLIENT_BATCH_SIZE || '2000', 10);
      
      console.log(`   Configuration: batch_size=${SUPABASE_CLIENT_BATCH_SIZE}, concurrency=${SCHEDULE_SEND_CONCURRENCY}`);
      
      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      
      // Process each term separately to maintain term isolation in Supabase
      for (const { term, deptResults } of allTermsData) {
        console.log(`\n   📅 Syncing term: ${term}`);
        
        // Collect all enriched and transformed courses across all departments for this term
        const allCleanCourses = [];
        for (const { department, courses } of deptResults) {
          const enrichedCourses = courses.map(c => ({ ...c, term_code: term }));
          const cleanCourses = supabase.transformScheduleData(enrichedCourses);
          allCleanCourses.push(...cleanCourses);
        }
        
        // Batch all courses using SUPABASE_CLIENT_BATCH_SIZE
        const scheduleBatches = chunkArray(allCleanCourses, SUPABASE_CLIENT_BATCH_SIZE);
        console.log(`   Batched ${allCleanCourses.length} course(s) into ${scheduleBatches.length} batch(es)`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Process batches with concurrency control
        const results = await processWithConcurrency(
          scheduleBatches,
          SCHEDULE_SEND_CONCURRENCY,
          async (batch, batchIndex) => {
            const totalBatchIndex = batchIndex + 1;
            console.log(`      📤 [${totalBatchIndex}/${scheduleBatches.length}] Sending schedule batch: records=${batch.length}`);
            
            try {
              // Send batch using syncToSupabase which handles the HTTP request and metadata
              await supabase.syncToSupabase('schedules', batch, term, ALL_DEPARTMENTS_LABEL);
              successCount += batch.length;
              console.log(`      ✅ [${totalBatchIndex}/${scheduleBatches.length}]: Batch sent successfully`);
              return true;
            } catch (err) {
              failureCount += batch.length;
              console.error(`      ❌ [${totalBatchIndex}/${scheduleBatches.length}]: Failed to send batch`);
              console.error(`         Error: ${err.message}`);
              if (process.env.DEBUG_SCRAPER === 'true') {
                console.error(`         Stack: ${err.stack}`);
              }
              return false;
            }
          }
        );
        
        totalSuccessCount += successCount;
        totalFailureCount += failureCount;
        
        console.log(`   ✅ Term ${term} sync complete: ${successCount} successful, ${failureCount} failed`);
      }
      
      phaseTimings.supabase = Date.now() - supabaseStart;
      
      // Final summary log
      console.log('\n✅ SCHEDULE SUPABASE SYNC COMPLETE', {
        total_terms: allTermsData.length,
        successful_records: totalSuccessCount,
        failed_records: totalFailureCount,
        duration_ms: phaseTimings.supabase
      });
      console.log(`   ⏱  Supabase sync: ${formatTime(phaseTimings.supabase)}`);
    } else if (!supabase) {
      console.log('\n   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
      phaseTimings.supabase = 0;
    }

    // 3. Google Sheets Sync
    if (sheets && allTermsData.length > 0) {
      console.log('\n📊 Syncing to Google Sheets...');
      const sheetsStart = Date.now();
      try {
        if (multiTermResults.length === 1) {
          // Single-term mode: use single tab (backward compatible)
          const { cleanSchedule } = allTermsData[0];
          await sheets.syncData(SPREADSHEET_ID, 'Schedules', cleanSchedule);
          console.log(`   ✅ Google Sheets sync completed (single tab: Schedules)`);
        } else {
          // Multi-term mode: create one tab per term
          for (const { term, cleanSchedule } of allTermsData) {
            const tabName = term; // Use term code as tab name (e.g., "2024-1", "2025-0")
            await sheets.syncData(SPREADSHEET_ID, tabName, cleanSchedule);
            console.log(`   ✅ Synced ${cleanSchedule.length} courses to tab: ${tabName}`);
          }
          console.log(`   ✅ Google Sheets sync completed (${allTermsData.length} tabs)`);
        }
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
    if (phaseTimings.termDiscovery) {
      console.log(`   Term discovery: ${formatTime(phaseTimings.termDiscovery)}`);
    }
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
    
    if (allTermsData.length === 0) {
      console.warn(`\n⚠️ No schedule data found for any terms.`);
      console.log("   This could be because:");
      console.log("   - No courses are available for the selected terms");
      console.log("   - The terms have not been published yet in AISIS");
      console.log("   - The session expired during scraping");
      console.log("   - There are issues with the AISIS system");
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
