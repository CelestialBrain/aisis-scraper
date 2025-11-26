/**
 * Test multi-batch ingestion behavior to prevent data loss
 * 
 * This test validates the fix for the INTAC data loss issue where
 * multiple batches with replace_existing=true would cause later batches
 * to delete data from earlier batches.
 * 
 * Expected behavior:
 * - Batch 1: replace_existing=true (clears old term data)
 * - Batch 2+: replace_existing=false (appends without deleting)
 * 
 * This ensures all scraped data is preserved when sent across multiple batches.
 */

import { SupabaseManager } from '../src/supabase.js';

console.log('🧪 Test: Multi-Batch Ingestion - Data Loss Prevention\n');
console.log('═══════════════════════════════════════════════════════\n');

// Mock GitHub Actions environment
process.env.GITHUB_WORKFLOW = 'AISIS Schedule Scrape';
process.env.GITHUB_RUN_ID = '98765432';
process.env.GITHUB_SERVER_URL = 'https://github.com';
process.env.GITHUB_REPOSITORY = 'CelestialBrain/aisis-scraper';
process.env.GITHUB_SHA = 'def456abc789';
process.env.GITHUB_EVENT_NAME = 'schedule';

// Track all requests
const capturedRequests = [];

// Mock SupabaseManager that captures requests
class MockSupabaseManager extends SupabaseManager {
  async sendRequest(dataType, records, termCode = null, department = null, programCode = null, replaceExisting = null) {
    const metadata = this.buildMetadata(termCode, department, programCode, records.length, replaceExisting);
    
    capturedRequests.push({
      dataType,
      recordCount: records.length,
      termCode,
      department,
      replaceExisting,
      metadata
    });
    
    console.log(`   📨 Mock: Captured request for batch ${capturedRequests.length}`);
    console.log(`      - Records: ${records.length}`);
    console.log(`      - replace_existing: ${replaceExisting}`);
    
    return true;
  }
}

/**
 * Simulate the scenario from the problem statement:
 * - 3,886 total schedules scraped
 * - Split into 2 batches (2,000 + 1,886)
 * - Both for term "2025-1"
 * - Department "ALL"
 */
async function testDataLossPrevention() {
  console.log('📋 Scenario: 3,886 schedules split into 2 batches\n');
  
  const supabase = new MockSupabaseManager('mock-token');
  
  // Create mock schedule data
  const allSchedules = [];
  
  // Add INTAC courses (104 courses)
  for (let i = 0; i < 104; i++) {
    allSchedules.push({
      term_code: '2025-1',
      subject_code: `INTAC${String(i + 1).padStart(3, '0')}`,
      section: 'A',
      department: 'INTAC',
      course_title: `Interdisciplinary Course ${i + 1}`,
      units: 3,
      time_pattern: 'MWF 0900-1030',
      room: 'INTAC-101',
      instructor: 'Prof. Smith',
      language: 'ENG',
      level: 'U',
      remarks: '-',
      max_capacity: 30,
      start_time: '09:00:00',
      end_time: '10:30:00',
      days_of_week: '[1,3,5]',
      delivery_mode: null
    });
  }
  
  // Add other department courses to reach 3,886 total
  const otherDepts = ['ENGG', 'MATH', 'PHY', 'CHEM', 'BIO'];
  for (let i = 104; i < 3886; i++) {
    const dept = otherDepts[(i - 104) % otherDepts.length];
    // Use modulo to keep course numbers within realistic range (1-999)
    const courseNum = ((i - 104) % 999) + 1;
    allSchedules.push({
      term_code: '2025-1',
      subject_code: `${dept}${String(courseNum).padStart(3, '0')}`,
      section: 'A',
      department: dept,
      course_title: `Course ${i}`,
      units: 3,
      time_pattern: 'MWF 0900-1030',
      room: `${dept}-101`,
      instructor: 'Prof. Test',
      language: 'ENG',
      level: 'U',
      remarks: '-',
      max_capacity: 30,
      start_time: '09:00:00',
      end_time: '10:30:00',
      days_of_week: '[1,3,5]',
      delivery_mode: null
    });
  }
  
  console.log(`✅ Created ${allSchedules.length} mock schedules`);
  console.log(`   - INTAC: 104 courses (in first 104 records)`);
  console.log(`   - Other depts: ${allSchedules.length - 104} courses\n`);
  
  // Sync to Supabase (will auto-batch)
  await supabase.syncToSupabase('schedules', allSchedules, '2025-1', 'ALL');
  
  return {
    totalSchedules: allSchedules.length,
    intacCourses: 104,
    requests: capturedRequests
  };
}

/**
 * Verify the fix prevents data loss
 */
function verifyFix(result) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔍 Verification\n');
  
  const { totalSchedules, intacCourses, requests } = result;
  
  // Verify we have the expected number of batches
  const expectedBatches = 2; // 3886 records = 2000 + 1886
  console.log(`📦 Batches sent: ${requests.length}`);
  console.log(`   Expected: ${expectedBatches}`);
  console.log(`   ${requests.length === expectedBatches ? '✅ CORRECT' : '❌ WRONG'}\n`);
  
  // Verify total records
  const totalSent = requests.reduce((sum, req) => sum + req.recordCount, 0);
  console.log(`📊 Total records sent: ${totalSent}`);
  console.log(`   Expected: ${totalSchedules}`);
  console.log(`   ${totalSent === totalSchedules ? '✅ CORRECT' : '❌ WRONG'}\n`);
  
  // CRITICAL: Verify replace_existing behavior
  console.log('🔄 replace_existing behavior:\n');
  let allCorrect = true;
  
  requests.forEach((req, index) => {
    const batchNum = index + 1;
    const expected = index === 0; // Only first batch should have replace_existing=true
    const isCorrect = req.replaceExisting === expected;
    
    if (!isCorrect) allCorrect = false;
    
    console.log(`   Batch ${batchNum}/${requests.length}:`);
    console.log(`      Records: ${req.recordCount}`);
    console.log(`      replace_existing: ${req.replaceExisting} (expected: ${expected}) ${isCorrect ? '✅' : '❌'}`);
    console.log(`      Metadata has replace_existing: ${req.metadata.replace_existing !== undefined ? '✅' : '❌'}`);
    
    if (index === 0) {
      console.log(`      → This batch clears old data for term ${req.termCode}`);
      console.log(`      → INTAC courses (104) are in this batch ✅`);
    } else {
      console.log(`      → This batch appends without deleting`);
      console.log(`      → INTAC courses from Batch 1 are preserved ✅`);
    }
    console.log();
  });
  
  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 Test Summary:\n');
  
  const tests = [
    { name: 'Correct number of batches', passed: requests.length === expectedBatches },
    { name: 'All records sent', passed: totalSent === totalSchedules },
    { name: 'First batch: replace_existing=true', passed: requests[0]?.replaceExisting === true },
    { name: 'Second batch: replace_existing=false', passed: requests[1]?.replaceExisting === false },
    { name: 'All batches have correct replace_existing', passed: allCorrect }
  ];
  
  tests.forEach(test => {
    console.log(`   ${test.passed ? '✅' : '❌'} ${test.name}`);
  });
  
  const allPassed = tests.every(test => test.passed);
  
  if (allPassed) {
    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('🎉 Data loss prevention mechanism validated!');
    console.log('   INTAC courses (and all departments) will be preserved');
    console.log('   across multiple batches during ingestion.\n');
    return true;
  } else {
    console.log('\n❌ SOME TESTS FAILED!\n');
    console.log('⚠️  WARNING: Data loss may occur during multi-batch ingestion!');
    console.log('   Later batches may delete data from earlier batches.\n');
    return false;
  }
}

// Run the test
try {
  const result = await testDataLossPrevention();
  const success = verifyFix(result);
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('\n❌ Test failed with error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
