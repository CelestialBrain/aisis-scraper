import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import { parseAllCurricula } from './curriculum-parser.js';
import { 
  dedupeCourses, 
  filterValidCourses, 
  groupByProgramVersion,
  buildBatchMetadata 
} from './curriculum-utils.js';
import { normalizeCourseCode, applyCourseMappings } from './constants.js';
import fs from 'fs';
import 'dotenv/config';

/**
 * AISIS Curriculum Scraper
 * 
 * This script scrapes curriculum data from AISIS using the J_VOFC.do endpoint.
 * 
 * IMPORTANT: This is an EXPERIMENTAL feature that depends on AISIS UI structure.
 * The J_VOFC.do endpoint was discovered through HAR file analysis and may break
 * if AISIS changes its curriculum page structure.
 * 
 * The scraper:
 * 1. Logs into AISIS
 * 2. GETs J_VOFC.do to retrieve available curriculum versions (degCode dropdown)
 * 3. POSTs to J_VOFC.do with each degCode to fetch curriculum HTML
 * 4. Parses curriculum HTML into structured course rows
 * 5. Normalizes course codes, deduplicates, and validates data
 * 6. Groups courses by program/version
 * 7. Sends exactly ONE HTTP request per program/version to Supabase with rich metadata
 * 8. Syncs to Google Sheets (optional)
 * 
 * See README.md and docs/CURRICULUM_LIMITATION.md for details and alternative solutions.
 */

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Curriculum Scraper');
  console.log('   ⚠️  NOTE: Curriculum scraping uses experimental J_VOFC.do endpoint');
  console.log('   This feature may break if AISIS changes its UI structure');
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
    console.log('🚀 Initializing scraper...');
    await scraper.init();

    console.log('🔐 Logging in...');
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      throw new Error('Login failed - check credentials');
    }

    console.log('📥 Scraping curriculum data...');
    const curriculumData = await scraper.scrapeCurriculum();

    if (!fs.existsSync('data')) fs.mkdirSync('data');
    if (!fs.existsSync('debug')) fs.mkdirSync('debug');

    if (curriculumData.length > 0) {
      console.log(`\n💾 Processing ${curriculumData.length} curriculum programs...`);
      
      // Filter out unavailable curricula (those with AISIS error page)
      const unavailableCurricula = curriculumData.filter(p => p.status === 'unavailable');
      const availableCurricula = curriculumData.filter(p => p.status !== 'unavailable');
      
      if (unavailableCurricula.length > 0) {
        console.log(`   ⚠️  ${unavailableCurricula.length} curricula marked as unavailable (AISIS error page):`);
        unavailableCurricula.forEach(p => {
          console.log(`      - ${p.degCode}: ${p.label}`);
        });
        console.log(`   ✅ ${availableCurricula.length} curricula available for processing\n`);
      }
      
      // Debug instrumentation: dump raw HTML for specific degCode before parsing
      const debugDegCode = process.env.DEBUG_DEGCODE || 'BS MGT-H_2025_1';
      const debugProgram = availableCurricula.find(p => p.degCode === debugDegCode);
      if (debugProgram) {
        console.log(`   🐛 Debug: Found ${debugDegCode} in scraped data, saving raw HTML...`);
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-raw.html`, debugProgram.html || '');
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-raw.json`, JSON.stringify(debugProgram, null, 2));
        console.log(`   ✅ Debug: Saved ${debugDegCode} raw HTML and JSON to debug/`);
      } else if (process.env.DEBUG_DEGCODE) {
        console.log(`   ⚠️  Debug: ${debugDegCode} not found in scraped data`);
      }
      
      // Only parse available curricula
      if (availableCurricula.length === 0) {
        console.warn(`   ⚠️  No available curricula to parse (all returned AISIS error page)`);
        console.log('\n✅ Curriculum scraping completed (no data to process)!');
        process.exit(0);
      }
      
      // Parse curriculum HTML into structured course rows
      console.log('   🔍 Parsing curriculum HTML into structured course rows...');
      let parseErrors = 0;
      const { programs, allRows } = parseAllCurricula(availableCurricula);
      
      // Check if debug program had a mismatch error during parsing
      if (debugProgram && !programs.find(p => p.degCode === debugDegCode)) {
        console.log(`   🐛 Debug: ${debugDegCode} was filtered during parsing (possible mismatch)`);
        // Dump mismatch HTML for inspection
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-mismatch.html`, debugProgram.html || '');
        console.log(`   ✅ Debug: Saved ${debugDegCode} mismatch HTML to debug/`);
      }
      
      console.log(`   ✅ Parsed ${programs.length} programs into ${allRows.length} course rows`);
      
      // Debug instrumentation: dump parsed rows for specific degCode after parsing
      if (debugProgram) {
        const debugRows = allRows.filter(row => row.deg_code === debugDegCode);
        console.log(`   🐛 Debug: Found ${debugRows.length} parsed rows for ${debugDegCode}, saving...`);
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-rows.json`, JSON.stringify(debugRows, null, 2));
        if (debugRows.length > 0) {
          console.log(`   🐛 Debug: Sample row program_title: "${debugRows[0].program_title}"`);
        }
        console.log(`   ✅ Debug: Saved ${debugDegCode} parsed rows to debug/`);
      }
      
      // ========================================================================
      // NEW REFACTORED PIPELINE: Normalize, Deduplicate, Validate, and Batch
      // ========================================================================
      
      console.log('\n📊 Processing curriculum data pipeline...');
      
      // Step 1: Normalize course codes and apply canonical mappings
      console.log('   1️⃣  Normalizing course codes and applying canonical mappings...');
      const normalizedRows = allRows.map(row => {
        const normalized = normalizeCourseCode(row.course_code);
        const canonical = applyCourseMappings(normalized);
        return {
          ...row,
          course_code: canonical
        };
      });
      console.log(`      ✅ Normalized ${normalizedRows.length} course codes`);
      
      // Step 2: Deduplicate courses
      console.log('   2️⃣  Deduplicating courses...');
      const beforeDedupeCount = normalizedRows.length;
      const dedupedRows = dedupeCourses(normalizedRows);
      const duplicatesRemoved = beforeDedupeCount - dedupedRows.length;
      console.log(`      ✅ Removed ${duplicatesRemoved} duplicate courses (${beforeDedupeCount} → ${dedupedRows.length})`);
      
      if (duplicatesRemoved > 0) {
        console.log(`      ℹ️  Duplicates removed per program:`);
        // Count duplicates per program
        const dupsByProgram = {};
        const normalizedByProgram = {};
        normalizedRows.forEach(r => {
          const deg = r.deg_code;
          normalizedByProgram[deg] = (normalizedByProgram[deg] || 0) + 1;
        });
        dedupedRows.forEach(r => {
          const deg = r.deg_code;
          const before = normalizedByProgram[deg] || 0;
          const after = dedupedRows.filter(dr => dr.deg_code === deg).length;
          if (before > after) {
            dupsByProgram[deg] = before - after;
          }
        });
        Object.entries(dupsByProgram).slice(0, 5).forEach(([deg, count]) => {
          console.log(`         ${deg}: ${count} duplicates`);
        });
        if (Object.keys(dupsByProgram).length > 5) {
          console.log(`         ... and ${Object.keys(dupsByProgram).length - 5} more programs`);
        }
      }
      
      // Step 3: Validate and filter courses
      console.log('   3️⃣  Validating courses...');
      const { valid: validRows, invalid: invalidRows } = filterValidCourses(dedupedRows);
      console.log(`      ✅ Validated ${validRows.length} courses, filtered ${invalidRows.length} invalid`);
      
      if (invalidRows.length > 0) {
        console.log(`      ⚠️  Sample invalid courses (showing up to 5):`);
        invalidRows.slice(0, 5).forEach(({ course, errors }) => {
          console.log(`         - ${course.deg_code} / ${course.course_code || '(missing)'}: ${errors.join(', ')}`);
        });
      }
      
      // Step 4: Group by program/version
      console.log('   4️⃣  Grouping by program/version...');
      const groupedByProgram = groupByProgramVersion(validRows);
      console.log(`      ✅ Grouped into ${groupedByProgram.size} program/version groups`);
      
      // Log summary stats per program
      console.log('\n   📋 Per-Program Summary:');
      const summaryEntries = Array.from(groupedByProgram.entries());
      summaryEntries.slice(0, 10).forEach(([degCode, courses]) => {
        console.log(`      ${degCode}: ${courses.length} courses`);
      });
      if (summaryEntries.length > 10) {
        console.log(`      ... and ${summaryEntries.length - 10} more programs`);
      }
      
      // 1. Local backup - save both detailed programs and flattened rows
      const curriculumOutput = {
        programs,      // Detailed view with programs and their rows (original format)
        allRows: validRows,       // Flattened view for easy querying (deduplicated & validated)
        metadata: {
          totalPrograms: programs.length,
          totalCourses: allRows.length,
          totalCoursesAfterProcessing: validRows.length,
          duplicatesRemoved: duplicatesRemoved,
          invalidCoursesRemoved: invalidRows.length,
          scrapedAt: new Date().toISOString()
        }
      };
      
      fs.writeFileSync('data/curriculum.json', JSON.stringify(curriculumOutput, null, 2));
      console.log(`\n   💾 Saved ${programs.length} programs (${validRows.length} valid courses) to data/curriculum.json`);

      // 2. Supabase Sync - NEW BATCHING APPROACH
      if (supabase && validRows.length > 0) {
        console.log('\n   🚀 Starting Supabase Sync (New Batching Approach)...');
        console.log(`      Sending ${groupedByProgram.size} batch(es), one per program/version\n`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Send one request per program/version
        for (const [degCode, courses] of groupedByProgram) {
          // Find original scraped courses for this program (before deduplication/validation)
          // for accurate metadata counts
          const originalCoursesForProgram = allRows.filter(r => r.deg_code === degCode);
          const dedupedCoursesForProgram = dedupedRows.filter(r => r.deg_code === degCode);
          const duplicatesForThisProgram = originalCoursesForProgram.length - dedupedCoursesForProgram.length;
          const invalidForThisProgram = dedupedCoursesForProgram.length - courses.length;
          
          // Build metadata for this program
          const metadata = buildBatchMetadata(
            degCode,
            originalCoursesForProgram,
            courses,
            duplicatesForThisProgram,
            invalidForThisProgram
          );
          
          // Send batch
          const batch = {
            deg_code: degCode,
            program_code: metadata.program_code,
            curriculum_version: metadata.curriculum_version,
            courses: courses,
            metadata: metadata
          };
          
          const success = await supabase.sendCurriculumBatch(batch);
          
          if (success) {
            successCount++;
          } else {
            failureCount++;
          }
        }
        
        // Summary
        console.log(`\n   📊 Supabase Sync Summary:`);
        console.log(`      Total batches: ${groupedByProgram.size}`);
        console.log(`      ✅ Successful: ${successCount}`);
        console.log(`      ❌ Failed: ${failureCount}`);
        console.log(`      Total courses synced: ${validRows.length}`);
        
        if (failureCount === 0) {
          console.log(`\n   ✅ All batches synced successfully!`);
        } else if (successCount > 0) {
          console.log(`\n   ⚠️  Partial success - some batches failed`);
        } else {
          console.log(`\n   ❌ All batches failed`);
        }
      } else {
        console.log('\n   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN or no rows)');
      }

      // 3. Google Sheets Sync - use flattened rows (like schedules)
      if (sheets && allRows.length > 0) {
        console.log('   📊 Syncing to Google Sheets...');
        try {
          // Sync flattened rows to Sheets, similar to how schedules are synced
          await sheets.syncData(SPREADSHEET_ID, 'Curriculum', allRows);
          console.log('   ✅ Google Sheets sync completed');
        } catch (error) {
          console.error('   ❌ Google Sheets sync failed:', error.message);
        }
      }

    } else {
      console.warn('\n⚠️ No curriculum data scraped.');
      console.log("   Possible reasons:");
      console.log("   - No curriculum versions found via J_VOFC.do degCode dropdown");
      console.log("   - All curriculum scraping attempts failed (check logs above)");
      console.log("   - AISIS may have changed the J_VOFC.do page structure");
      console.log("   - See README.md for alternative solutions");
    }

    console.log('\n✅ Curriculum scraping completed!');
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
