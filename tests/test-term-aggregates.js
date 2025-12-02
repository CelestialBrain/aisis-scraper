/**
 * Test term aggregates computation for pre-flight validation
 * 
 * This test validates the computeTermAggregates() method which provides
 * full term context for Edge Function validation even when data is sent in chunks.
 * 
 * Expected behavior:
 * - Compute total_records count
 * - Compute per-department course counts
 * - Compute per-department subject prefix distribution
 * - Include computed_at timestamp
 */

import { SupabaseManager } from '../src/supabase.js';

console.log('🧪 Test: Term Aggregates Computation\n');
console.log('═══════════════════════════════════════════════════════\n');

// Mock GitHub Actions environment
process.env.GITHUB_WORKFLOW = 'Test Workflow';
process.env.GITHUB_RUN_ID = '12345';

/**
 * Test 1: Basic aggregates computation
 */
async function testBasicAggregates() {
  console.log('📋 Test 1: Basic aggregates computation\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  
  const testData = [
    { department: 'MA', subject_code: 'MATH101', term_code: '2025-1' },
    { department: 'MA', subject_code: 'MATH102', term_code: '2025-1' },
    { department: 'MA', subject_code: 'MATH201', term_code: '2025-1' },
    { department: 'EN', subject_code: 'EN101', term_code: '2025-1' },
    { department: 'EN', subject_code: 'EN102', term_code: '2025-1' },
  ];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  // Verify structure
  if (aggregates.total_records !== 5) {
    console.error('❌ Test 1 failed: Expected 5 total_records, got', aggregates.total_records);
    return false;
  }
  
  if (!aggregates.departments || typeof aggregates.departments !== 'object') {
    console.error('❌ Test 1 failed: departments should be an object');
    return false;
  }
  
  if (!aggregates.computed_at || typeof aggregates.computed_at !== 'string') {
    console.error('❌ Test 1 failed: computed_at should be a timestamp string');
    return false;
  }
  
  // Verify MA department
  if (!aggregates.departments.MA || aggregates.departments.MA.count !== 3) {
    console.error('❌ Test 1 failed: MA department should have count of 3');
    return false;
  }
  
  if (!aggregates.departments.MA.prefixes || aggregates.departments.MA.prefixes.MATH !== 3) {
    console.error('❌ Test 1 failed: MA department should have MATH prefix count of 3');
    return false;
  }
  
  // Verify EN department
  if (!aggregates.departments.EN || aggregates.departments.EN.count !== 2) {
    console.error('❌ Test 1 failed: EN department should have count of 2');
    return false;
  }
  
  if (!aggregates.departments.EN.prefixes || aggregates.departments.EN.prefixes.EN !== 2) {
    console.error('❌ Test 1 failed: EN department should have EN prefix count of 2');
    return false;
  }
  
  console.log('✅ Test 1 passed: Basic aggregates computed correctly\n');
  console.log('   Total records:', aggregates.total_records);
  console.log('   Departments:', Object.keys(aggregates.departments).join(', '));
  console.log('   MA dept:', JSON.stringify(aggregates.departments.MA));
  console.log('   EN dept:', JSON.stringify(aggregates.departments.EN));
  console.log();
  
  return true;
}

/**
 * Test 2: Multi-department with multiple prefixes
 */
async function testMultiPrefixAggregates() {
  console.log('📋 Test 2: Multi-department with multiple prefixes\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  
  const testData = [
    { department: 'PE', subject_code: 'PEPC101', term_code: '2025-1' },
    { department: 'PE', subject_code: 'PEPC102', term_code: '2025-1' },
    { department: 'PE', subject_code: 'PEPC103', term_code: '2025-1' },
    { department: 'PE', subject_code: 'PED101', term_code: '2025-1' },
    { department: 'PE', subject_code: 'PED102', term_code: '2025-1' },
    { department: 'PE', subject_code: 'PE101', term_code: '2025-1' },
  ];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== 6) {
    console.error('❌ Test 2 failed: Expected 6 total_records, got', aggregates.total_records);
    return false;
  }
  
  if (aggregates.departments.PE.count !== 6) {
    console.error('❌ Test 2 failed: PE department should have count of 6');
    return false;
  }
  
  const pePrefixes = aggregates.departments.PE.prefixes;
  if (pePrefixes.PEPC !== 3 || pePrefixes.PED !== 2 || pePrefixes.PE !== 1) {
    console.error('❌ Test 2 failed: PE department prefixes incorrect');
    console.error('   Expected: PEPC=3, PED=2, PE=1');
    console.error('   Got:', JSON.stringify(pePrefixes));
    return false;
  }
  
  console.log('✅ Test 2 passed: Multi-prefix aggregates computed correctly\n');
  console.log('   PE dept prefixes:', JSON.stringify(pePrefixes));
  console.log();
  
  return true;
}

/**
 * Test 3: Edge case - empty data
 */
async function testEmptyData() {
  console.log('📋 Test 3: Edge case - empty data\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  const testData = [];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== 0) {
    console.error('❌ Test 3 failed: Expected 0 total_records for empty data');
    return false;
  }
  
  if (Object.keys(aggregates.departments).length !== 0) {
    console.error('❌ Test 3 failed: Expected empty departments object');
    return false;
  }
  
  console.log('✅ Test 3 passed: Empty data handled correctly\n');
  return true;
}

/**
 * Test 4: Edge case - single record
 */
async function testSingleRecord() {
  console.log('📋 Test 4: Edge case - single record\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  const testData = [
    { department: 'CS', subject_code: 'CS101', term_code: '2025-1' }
  ];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== 1) {
    console.error('❌ Test 4 failed: Expected 1 total_records');
    return false;
  }
  
  if (aggregates.departments.CS.count !== 1 || aggregates.departments.CS.prefixes.CS !== 1) {
    console.error('❌ Test 4 failed: Single record aggregates incorrect');
    return false;
  }
  
  console.log('✅ Test 4 passed: Single record handled correctly\n');
  return true;
}

/**
 * Test 5: Edge case - missing department
 */
async function testMissingDepartment() {
  console.log('📋 Test 5: Edge case - missing department\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  const testData = [
    { subject_code: 'MATH101', term_code: '2025-1' },
    { department: 'MA', subject_code: 'MATH102', term_code: '2025-1' }
  ];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== 2) {
    console.error('❌ Test 5 failed: Expected 2 total_records');
    return false;
  }
  
  // Record without department should be grouped under UNKNOWN
  if (!aggregates.departments.UNKNOWN || aggregates.departments.UNKNOWN.count !== 1) {
    console.error('❌ Test 5 failed: Missing department should be grouped under UNKNOWN');
    return false;
  }
  
  if (!aggregates.departments.MA || aggregates.departments.MA.count !== 1) {
    console.error('❌ Test 5 failed: MA department should have count of 1');
    return false;
  }
  
  console.log('✅ Test 5 passed: Missing department handled correctly\n');
  return true;
}

/**
 * Test 6: Edge case - missing subject_code
 */
async function testMissingSubjectCode() {
  console.log('📋 Test 6: Edge case - missing subject_code\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  const testData = [
    { department: 'MA', term_code: '2025-1' },
    { department: 'MA', subject_code: 'MATH101', term_code: '2025-1' }
  ];
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== 2) {
    console.error('❌ Test 6 failed: Expected 2 total_records');
    return false;
  }
  
  if (aggregates.departments.MA.count !== 2) {
    console.error('❌ Test 6 failed: MA department should have count of 2');
    return false;
  }
  
  // Only one should have a prefix
  if (aggregates.departments.MA.prefixes.MATH !== 1) {
    console.error('❌ Test 6 failed: MA department should have MATH prefix count of 1');
    return false;
  }
  
  console.log('✅ Test 6 passed: Missing subject_code handled correctly\n');
  return true;
}

/**
 * Test 7: Large dataset simulation (like in problem statement)
 */
async function testLargeDataset() {
  console.log('📋 Test 7: Large dataset simulation\n');
  
  const supabase = new SupabaseManager('test-token', 'https://test.supabase.co');
  const testData = [];
  
  // Simulate the scenario from problem statement:
  // 214 MA courses with MATH prefix
  for (let i = 0; i < 214; i++) {
    testData.push({
      department: 'MA',
      subject_code: `MATH${100 + i}`,
      term_code: '2025-1'
    });
  }
  
  // 242 PE courses with mixed prefixes
  for (let i = 0; i < 236; i++) {
    testData.push({
      department: 'PE',
      subject_code: `PEPC${100 + i}`,
      term_code: '2025-1'
    });
  }
  for (let i = 0; i < 5; i++) {
    testData.push({
      department: 'PE',
      subject_code: `PED${100 + i}`,
      term_code: '2025-1'
    });
  }
  testData.push({
    department: 'PE',
    subject_code: 'PE101',
    term_code: '2025-1'
  });
  
  // 242 PH courses with PHYS prefix
  for (let i = 0; i < 242; i++) {
    testData.push({
      department: 'PH',
      subject_code: `PHYS${100 + i}`,
      term_code: '2025-1'
    });
  }
  
  // 179 EN courses
  for (let i = 0; i < 179; i++) {
    testData.push({
      department: 'EN',
      subject_code: `EN${100 + i}`,
      term_code: '2025-1'
    });
  }
  
  const totalCourses = 214 + 242 + 242 + 179; // 877
  
  const aggregates = supabase.computeTermAggregates(testData);
  
  if (aggregates.total_records !== totalCourses) {
    console.error(`❌ Test 7 failed: Expected ${totalCourses} total_records, got`, aggregates.total_records);
    return false;
  }
  
  // Verify MA department
  if (aggregates.departments.MA.count !== 214 || aggregates.departments.MA.prefixes.MATH !== 214) {
    console.error('❌ Test 7 failed: MA department aggregates incorrect');
    console.error('   Expected: count=214, MATH=214');
    console.error('   Got:', JSON.stringify(aggregates.departments.MA));
    return false;
  }
  
  // Verify PE department
  if (aggregates.departments.PE.count !== 242) {
    console.error('❌ Test 7 failed: PE department should have count of 242');
    return false;
  }
  
  const pePrefixes = aggregates.departments.PE.prefixes;
  if (pePrefixes.PEPC !== 236 || pePrefixes.PED !== 5 || pePrefixes.PE !== 1) {
    console.error('❌ Test 7 failed: PE department prefixes incorrect');
    console.error('   Expected: PEPC=236, PED=5, PE=1');
    console.error('   Got:', JSON.stringify(pePrefixes));
    return false;
  }
  
  // Verify PH department
  if (aggregates.departments.PH.count !== 242 || aggregates.departments.PH.prefixes.PHYS !== 242) {
    console.error('❌ Test 7 failed: PH department aggregates incorrect');
    return false;
  }
  
  // Verify EN department
  if (aggregates.departments.EN.count !== 179 || aggregates.departments.EN.prefixes.EN !== 179) {
    console.error('❌ Test 7 failed: EN department aggregates incorrect');
    return false;
  }
  
  console.log('✅ Test 7 passed: Large dataset aggregates computed correctly\n');
  console.log('   Total records:', aggregates.total_records);
  console.log('   MA dept:', JSON.stringify(aggregates.departments.MA));
  console.log('   PE dept:', JSON.stringify(aggregates.departments.PE));
  console.log('   PH dept:', JSON.stringify(aggregates.departments.PH));
  console.log('   EN dept:', JSON.stringify(aggregates.departments.EN));
  console.log();
  
  return true;
}

/**
 * Test 8: Integration with syncToSupabase - verify aggregates in metadata
 */
async function testSyncIntegration() {
  console.log('📋 Test 8: Integration with syncToSupabase\n');
  
  // Track captured requests
  const capturedRequests = [];
  
  // Mock SupabaseManager that captures requests
  class MockSupabaseManager extends SupabaseManager {
    constructor(token) {
      super(token, 'https://test.supabase.co');
    }
    async sendRequest(dataType, records, termCode = null, department = null, programCode = null, replaceExisting = null, chunkIndex = null, totalChunks = null, termAggregates = null) {
      const metadata = this.buildMetadata(termCode, department, programCode, records.length, replaceExisting, chunkIndex, totalChunks, termAggregates);
      
      capturedRequests.push({
        dataType,
        recordCount: records.length,
        termCode,
        replaceExisting,
        chunkIndex,
        totalChunks,
        metadata,
        hasTermAggregates: metadata.term_aggregates !== undefined
      });
      
      return true;
    }
  }
  
  const supabase = new MockSupabaseManager('test-token');
  
  // Create test data that will be split into 2 batches (2000 per batch by default)
  const testData = [];
  for (let i = 0; i < 2500; i++) {
    testData.push({
      department: i < 1250 ? 'MA' : 'EN',
      subject_code: i < 1250 ? `MATH${100 + i}` : `EN${100 + i}`,
      term_code: '2025-1',
      section: 'A',
      course_title: 'Test Course',
      units: 3,
      time_pattern: 'MWF 0900-1030',
      room: 'TEST-101',
      instructor: 'Prof. Test',
      language: 'ENG',
      level: 'U',
      remarks: '-',
      max_capacity: 30
    });
  }
  
  // Sync to Supabase - should split into 2 batches
  await supabase.syncToSupabase('schedules', testData, '2025-1');
  
  // Verify we captured 2 requests
  if (capturedRequests.length !== 2) {
    console.error('❌ Test 8 failed: Expected 2 batches, got', capturedRequests.length);
    return false;
  }
  
  // Verify first batch has term_aggregates
  const firstBatch = capturedRequests[0];
  if (!firstBatch.hasTermAggregates) {
    console.error('❌ Test 8 failed: First batch should have term_aggregates in metadata');
    return false;
  }
  
  if (!firstBatch.metadata.term_aggregates) {
    console.error('❌ Test 8 failed: First batch metadata missing term_aggregates');
    return false;
  }
  
  // Verify term_aggregates structure
  const aggregates = firstBatch.metadata.term_aggregates;
  if (aggregates.total_records !== 2500) {
    console.error('❌ Test 8 failed: term_aggregates should show 2500 total records (full dataset)');
    console.error('   Got:', aggregates.total_records);
    return false;
  }
  
  if (aggregates.departments.MA.count !== 1250 || aggregates.departments.EN.count !== 1250) {
    console.error('❌ Test 8 failed: term_aggregates department counts incorrect');
    return false;
  }
  
  // Verify is_chunked_upload flag
  if (!firstBatch.metadata.is_chunked_upload) {
    console.error('❌ Test 8 failed: First batch should have is_chunked_upload=true');
    return false;
  }
  
  // Verify second batch does NOT have term_aggregates
  const secondBatch = capturedRequests[1];
  if (secondBatch.hasTermAggregates) {
    console.error('❌ Test 8 failed: Second batch should NOT have term_aggregates in metadata');
    return false;
  }
  
  // Verify second batch still has is_chunked_upload flag
  if (!secondBatch.metadata.is_chunked_upload) {
    console.error('❌ Test 8 failed: Second batch should have is_chunked_upload=true');
    return false;
  }
  
  console.log('✅ Test 8 passed: Integration with syncToSupabase works correctly\n');
  console.log('   First batch: has term_aggregates =', firstBatch.hasTermAggregates);
  console.log('   First batch aggregates:', JSON.stringify(aggregates, null, 2).substring(0, 200) + '...');
  console.log('   Second batch: has term_aggregates =', secondBatch.hasTermAggregates);
  console.log();
  
  return true;
}

/**
 * Test 9: Single batch should NOT have term_aggregates
 */
async function testSingleBatchNoAggregates() {
  console.log('📋 Test 9: Single batch should NOT compute term_aggregates\n');
  
  const capturedRequests = [];
  
  class MockSupabaseManager extends SupabaseManager {
    constructor(token) {
      super(token, 'https://test.supabase.co');
    }
    async sendRequest(dataType, records, termCode = null, department = null, programCode = null, replaceExisting = null, chunkIndex = null, totalChunks = null, termAggregates = null) {
      const metadata = this.buildMetadata(termCode, department, programCode, records.length, replaceExisting, chunkIndex, totalChunks, termAggregates);
      
      capturedRequests.push({
        metadata,
        hasTermAggregates: metadata.term_aggregates !== undefined,
        hasChunkedFlag: metadata.is_chunked_upload === true
      });
      
      return true;
    }
  }
  
  const supabase = new MockSupabaseManager('test-token');
  
  // Create small test data that fits in single batch
  const testData = [];
  for (let i = 0; i < 100; i++) {
    testData.push({
      department: 'MA',
      subject_code: `MATH${100 + i}`,
      term_code: '2025-1',
      section: 'A',
      course_title: 'Test Course',
      units: 3,
      time_pattern: 'MWF 0900-1030',
      room: 'TEST-101',
      instructor: 'Prof. Test',
      language: 'ENG',
      level: 'U',
      remarks: '-',
      max_capacity: 30
    });
  }
  
  await supabase.syncToSupabase('schedules', testData, '2025-1');
  
  if (capturedRequests.length !== 1) {
    console.error('❌ Test 9 failed: Expected 1 batch, got', capturedRequests.length);
    return false;
  }
  
  const batch = capturedRequests[0];
  if (batch.hasTermAggregates) {
    console.error('❌ Test 9 failed: Single batch should NOT have term_aggregates');
    return false;
  }
  
  if (batch.hasChunkedFlag) {
    console.error('❌ Test 9 failed: Single batch should NOT have is_chunked_upload flag');
    return false;
  }
  
  console.log('✅ Test 9 passed: Single batch correctly omits term_aggregates\n');
  return true;
}

// Run all tests
async function runAllTests() {
  const tests = [
    testBasicAggregates,
    testMultiPrefixAggregates,
    testEmptyData,
    testSingleRecord,
    testMissingDepartment,
    testMissingSubjectCode,
    testLargeDataset,
    testSyncIntegration,
    testSingleBatchNoAggregates
  ];
  
  let passCount = 0;
  let failCount = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.error(`❌ Test threw exception:`, error);
      failCount++;
    }
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📊 Test Results:');
  console.log(`   Total: ${tests.length}`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log();
  
  if (failCount === 0) {
    console.log('✅ All tests passed!');
    return true;
  } else {
    console.log('❌ Some tests failed!');
    return false;
  }
}

// Run tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
