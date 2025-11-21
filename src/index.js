import dotenv from 'dotenv';
import { AISISScraper } from './scraper.js';
import { SheetsManager } from './sheets.js';
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
      'GOOGLE_SPREADSHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY'
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

    // Initialize Google Sheets manager
    const credentials = {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID || 'aisis-scraper',
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || '',
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)}`
    };

    const sheetsManager = new SheetsManager(
      process.env.GOOGLE_SPREADSHEET_ID,
      credentials
    );

    // Authenticate and update Google Sheets
    await sheetsManager.authenticate();
    await sheetsManager.updateAllData(scrapedData);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ AISIS Data Scraper - Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    // Print summary
    console.log('📊 Summary:');
    console.log(`   Schedule of Classes: ${scrapedData.scheduleOfClasses?.length || 0} records`);
    console.log(`   Official Curriculum: ${scrapedData.officialCurriculum?.length || 0} records`);
    console.log(`   View Grades: ${scrapedData.viewGrades?.length || 0} records`);
    console.log(`   Advisory Grades: ${scrapedData.advisoryGrades?.length || 0} records`);
    console.log(`   Currently Enrolled: ${scrapedData.enrolledClasses?.length || 0} records`);
    console.log(`   My Class Schedule: ${scrapedData.classSchedule?.length || 0} records`);
    console.log(`   Tuition Receipt: ${scrapedData.tuitionReceipt?.length || 0} records`);
    console.log(`   Student Information: ${scrapedData.studentInfo?.length || 0} records`);
    console.log(`   Program of Study: ${scrapedData.programOfStudy?.length || 0} records`);
    console.log(`   Hold Orders: ${scrapedData.holdOrders?.length || 0} records`);
    console.log(`   Faculty Attendance: ${scrapedData.facultyAttendance?.length || 0} records`);
    console.log('');

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
