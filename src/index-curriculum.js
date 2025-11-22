import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import { GoogleSheetsManager } from './sheets.js';
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

    if (curriculumData.length > 0) {
      console.log(`\n💾 Processing ${curriculumData.length} curriculum courses...`);
      
      const cleanCurriculum = supabase ? supabase.transformCurriculumData(curriculumData) : curriculumData;
      
      // 1. Local backup
      fs.writeFileSync('data/curriculum.json', JSON.stringify(cleanCurriculum, null, 2));
      console.log(`   ✅ Saved ${curriculumData.length} curriculum courses to data/curriculum.json`);

      // 2. Supabase Sync
      if (supabase) {
        console.log('   🚀 Starting Supabase Sync...');
        
        // Sync curriculum data to Supabase
        // The backend API supports 'curriculum' as a valid data type
        // See docs/DATA_GUIDE.md for curriculum data model details
        try {
          const success = await supabase.syncToSupabase('curriculum', cleanCurriculum, null, null);
          if (success) {
            console.log('   ✅ Supabase sync completed successfully');
          } else {
            console.log('   ⚠️ Supabase sync had some failures');
          }
        } catch (error) {
          console.error('   ❌ Supabase sync failed:', error.message);
        }
      } else {
        console.log('   ⚠️ Supabase sync skipped (no DATA_INGEST_TOKEN)');
      }

      // 3. Google Sheets Sync
      if (sheets) {
        console.log('   📊 Syncing to Google Sheets...');
        try {
          await sheets.syncData(SPREADSHEET_ID, 'Curriculum', cleanCurriculum);
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
