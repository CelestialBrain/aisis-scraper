import dotenv from 'dotenv';
import { AISISScraper } from './scraper.js';
import { SupabaseManager } from './supabase.js';
import fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * Main execution function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎓 AISIS Data Scraper - Starting...');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Validate environment variables
    const requiredEnvVars = [
      'AISIS_USERNAME',
      'AISIS_PASSWORD',
      'SUPABASE_SYNC_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Initialize scraper
    const scraper = new AISISScraper(
      process.env.AISIS_USERNAME,
      process.env.AISIS_PASSWORD
    );

    // Scrape all data
    const scrapedData = await scraper.scrapeAll();

    // Save scraped data to JSON file (for backup)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `./data/backup_${timestamp}.json`;
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
    
    fs.writeFileSync(backupFile, JSON.stringify(scrapedData, null, 2));
    console.log(`\n💾 Data backed up to: ${backupFile}`);

    // Sync to Supabase
    console.log('\n☁️ Starting Supabase Sync...');
    const supabase = new SupabaseManager(process.env.SUPABASE_SYNC_KEY);
    
    // Set the current term (Update this manually when the semester changes)
    const CURRENT_TERM = '20253'; 

    if (scrapedData.scheduleOfClasses && scrapedData.scheduleOfClasses.length > 0) {
      // Group data by department because Lovable expects per-department sync
      const schedulesByDept = scrapedData.scheduleOfClasses.reduce((acc, item) => {
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
  }
}

// Run main function
main();
