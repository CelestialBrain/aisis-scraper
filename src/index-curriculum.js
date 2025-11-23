import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
import { parseAllCurricula } from './curriculum-parser.js';
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
 * 4. Flattens curriculum HTML to text format
 * 5. Saves to data/curriculum.json and syncs to Supabase/Google Sheets
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
      
      // Debug instrumentation: dump raw HTML for specific degCode before parsing
      const debugDegCode = process.env.DEBUG_DEGCODE || 'BS MGT-H_2025_1';
      const debugProgram = curriculumData.find(p => p.degCode === debugDegCode);
      if (debugProgram) {
        console.log(`   🐛 Debug: Found ${debugDegCode} in scraped data, saving raw HTML...`);
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-raw.html`, debugProgram.html || '');
        fs.writeFileSync(`debug/${debugDegCode.replace(/[/\\:*?"<>|]/g, '_')}-raw.json`, JSON.stringify(debugProgram, null, 2));
        console.log(`   ✅ Debug: Saved ${debugDegCode} raw HTML and JSON to debug/`);
      } else if (process.env.DEBUG_DEGCODE) {
        console.log(`   ⚠️  Debug: ${debugDegCode} not found in scraped data`);
      }
      
      // Parse curriculum HTML into structured course rows
      console.log('   🔍 Parsing curriculum HTML into structured course rows...');
      let parseErrors = 0;
      const { programs, allRows } = parseAllCurricula(curriculumData);
      
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
      
      // 1. Local backup - save both detailed programs and flattened rows
      const curriculumOutput = {
        programs,      // Detailed view with programs and their rows
        allRows,       // Flattened view for easy querying
        metadata: {
          totalPrograms: programs.length,
          totalCourses: allRows.length,
          scrapedAt: new Date().toISOString()
        }
      };
      
      fs.writeFileSync('data/curriculum.json', JSON.stringify(curriculumOutput, null, 2));
      console.log(`   ✅ Saved ${programs.length} programs (${allRows.length} courses) to data/curriculum.json`);

      // 2. Supabase Sync - use flattened rows
      if (supabase && allRows.length > 0) {
        console.log('   🚀 Starting Supabase Sync...');
        
        // Transform the structured rows to match Supabase schema
        // The allRows already have the correct field names from the parser
        const transformedRows = allRows.map(row => ({
          degree_code: row.deg_code,
          program_label: row.program_label,
          program_title: row.program_title,
          year_level: row.year_level,
          semester: row.semester,
          course_code: row.course_code,
          course_title: row.course_title,
          units: row.units,
          prerequisites: row.prerequisites,
          category: row.category
        }));
        
        try {
          const success = await supabase.syncToSupabase('curriculum', transformedRows, null, null);
          if (success) {
            console.log('   ✅ Supabase sync completed successfully');
          } else {
            console.log('   ⚠️ Supabase sync had some failures');
          }
        } catch (error) {
          console.error('   ❌ Supabase sync failed:', error.message);
        }
      } else {
        console.log('   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN or no rows)');
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
