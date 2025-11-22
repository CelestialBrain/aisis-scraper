/**
 * Test script for AISIS curriculum scraper using J_VOFC.do endpoint
 * 
 * This script tests the new curriculum scraping functionality that uses
 * the J_VOFC.do endpoint with degCode parameter.
 */

import { AISISScraper } from './src/scraper.js';
import { parseAllCurricula } from './src/curriculum-parser.js';
import 'dotenv/config';

async function testCurriculumEndpoint() {
  const { AISIS_USERNAME, AISIS_PASSWORD } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('❌ Missing credentials in .env file');
    console.error('   Please set AISIS_USERNAME and AISIS_PASSWORD');
    process.exit(1);
  }

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
  
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧪 Testing J_VOFC.do Curriculum Endpoint');
    console.log('═══════════════════════════════════════════════════════\n');

    // Initialize and login
    await scraper.init();
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      console.error('❌ Login failed');
      process.exit(1);
    }

    // Test 1: Get degree programs (degCode dropdown)
    console.log('\n📋 Test 1: Fetching degree programs from J_VOFC.do...\n');
    const degreePrograms = await scraper.getDegreePrograms();
    
    if (degreePrograms.length === 0) {
      console.warn('⚠️  No degree programs found!');
      console.warn('   This could mean:');
      console.warn('   - The J_VOFC.do endpoint has changed');
      console.warn('   - The degCode select element is missing');
      console.warn('   - Access permissions have changed');
      process.exit(1);
    }

    console.log(`✅ Found ${degreePrograms.length} curriculum versions\n`);
    console.log('   First 5 degree programs:');
    degreePrograms.slice(0, 5).forEach((prog, i) => {
      console.log(`   ${i + 1}. ${prog.degCode} - ${prog.label}`);
    });

    // Test 2: Scrape a single curriculum
    console.log('\n📖 Test 2: Scraping a single curriculum...\n');
    
    if (degreePrograms.length === 0) {
      console.error('❌ Cannot test scraping - no degree programs found');
      process.exit(1);
    }
    
    const testDegCode = degreePrograms[0].degCode;
    console.log(`   Testing with: ${testDegCode}`);

    try {
      const html = await scraper._scrapeDegree(testDegCode);
      console.log(`   ✅ Received HTML: ${html.length} characters`);
      
      // Test 3: Parse HTML to structured data
      console.log('\n📝 Test 3: Parsing curriculum HTML to structured data...\n');
      const { parseCurriculumHtml } = await import('./src/curriculum-parser.js');
      const parsedRows = parseCurriculumHtml(html, testDegCode, degreePrograms[0].label);
      
      console.log(`   ✅ Parsed ${parsedRows.length} course rows`);
      
      if (parsedRows.length > 0) {
        console.log('\n   Sample parsed course row:');
        const sample = parsedRows[0];
        console.log(`   deg_code: ${sample.deg_code}`);
        console.log(`   program_label: ${sample.program_label}`);
        console.log(`   year_level: ${sample.year_level}`);
        console.log(`   semester: ${sample.semester}`);
        console.log(`   course_code: ${sample.course_code}`);
        console.log(`   course_title: ${sample.course_title}`);
        console.log(`   units: ${sample.units}`);
        console.log(`   prerequisites: ${sample.prerequisites}`);
        console.log(`   category: ${sample.category}`);
      } else {
        console.warn('\n   ⚠️  No courses parsed from HTML - parser may need adjustment');
      }
      
      // Test 3b: Also show flattened text for comparison
      console.log('\n📝 Test 3b: Flattening curriculum HTML to text (legacy)...\n');
      const flattenedText = scraper._flattenCurriculumHtmlToText(html);
      console.log(`   ✅ Flattened text: ${flattenedText.length} characters`);
      console.log('\n   First 500 characters of flattened text:');
      console.log('   ' + '─'.repeat(60));
      console.log(flattenedText.substring(0, 500).split('\n').map(line => `   ${line}`).join('\n'));
      console.log('   ' + '─'.repeat(60));

      // Check if flattened text looks reasonable
      if (flattenedText.length < 100) {
        console.warn('\n   ⚠️  Warning: Flattened text is very short!');
        console.warn('   The HTML structure may have changed.');
      } else {
        console.log('\n   ✅ Flattened text looks reasonable');
      }

    } catch (error) {
      console.error(`   ❌ Error scraping curriculum: ${error.message}`);
      process.exit(1);
    }

    // Test 4: Test full workflow with limited number of curricula
    console.log('\n🔄 Test 4: Testing full scraping workflow (first 3 curricula)...\n');
    
    // Temporarily limit getDegreePrograms to return only 3 for testing
    const originalGetDegreePrograms = scraper.getDegreePrograms.bind(scraper);
    scraper.getDegreePrograms = async () => {
      const all = await originalGetDegreePrograms();
      return all.slice(0, 3);
    };

    const curricula = await scraper.scrapeCurriculum();
    
    // Parse all curricula with the new parser
    const { programs, allRows } = parseAllCurricula(curricula);
    
    console.log(`\n📊 Test Results:`);
    console.log(`   Total scraped: ${curricula.length} programs`);
    console.log(`   Total parsed: ${programs.length} programs with ${allRows.length} course rows`);
    
    if (curricula.length > 0) {
      console.log('\n   Sample raw curriculum record:');
      const sample = curricula[0];
      console.log(`   degCode: ${sample.degCode}`);
      console.log(`   label: ${sample.label}`);
      console.log(`   html length: ${sample.html ? sample.html.length : 0} characters`);
      console.log(`   raw_text length: ${sample.raw_text.length} characters`);
      
      if (allRows.length > 0) {
        console.log('\n   Sample structured course row:');
        const row = allRows[0];
        console.log(`   deg_code: ${row.deg_code}`);
        console.log(`   program_label: ${row.program_label}`);
        console.log(`   year_level: ${row.year_level}`);
        console.log(`   semester: ${row.semester}`);
        console.log(`   course_code: ${row.course_code}`);
        console.log(`   course_title: ${row.course_title}`);
        console.log(`   units: ${row.units}`);
      }
      
      console.log('\n   ✅ All tests passed!');
    } else {
      console.warn('\n   ⚠️  No curricula scraped - check logs above for errors');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Testing Complete!');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
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

testCurriculumEndpoint();
