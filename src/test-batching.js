/**
 * Test client-side batching and metadata propagation
 */

import { SupabaseManager } from './supabase.js';

console.log('🧪 Test: Client-Side Batching & Metadata\n');
console.log('═══════════════════════════════════════════════════════\n');

// Mock environment variables for GitHub Actions context
process.env.GITHUB_WORKFLOW = 'AISIS Schedule Scrape';
process.env.GITHUB_RUN_ID = '12345678';
process.env.GITHUB_SERVER_URL = 'https://github.com';
process.env.GITHUB_REPOSITORY = 'CelestialBrain/aisis-scraper';
process.env.GITHUB_SHA = 'abc123def456';
process.env.GITHUB_EVENT_NAME = 'schedule';
process.env.SUPABASE_URL = 'https://test-project.supabase.co';

console.log('✅ Set up mock GitHub Actions environment variables\n');

// Capture requests by overriding the sendRequest method
let capturedRequests = [];

// Create a custom SupabaseManager for testing
class TestSupabaseManager extends SupabaseManager {
  async sendRequest(dataType, records, termCode = null, department = null, programCode = null, replaceExisting = null) {
    // Use the parent class's buildMetadata method with replaceExisting parameter
    const metadata = this.buildMetadata(termCode, department, programCode, records.length, replaceExisting);

    const payload = {
      data_type: dataType,
      records: records,
      metadata: metadata
    };

    // Capture the request
    capturedRequests.push({
      url: this.url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.ingestToken}`
      },
      payload
    });

    // Simulate success
    console.log(`   📊 Edge function response: ${records.length}/${records.length} records upserted`);
    return true;
  }
}

// Create a large dataset to test batching
console.log('📦 Creating test dataset...');
const largeDataset = [];
// Create 4500 records to ensure we get 3 batches (2000 + 2000 + 500)
// This will properly test the replace_existing behavior across multiple batches
for (let i = 0; i < 4500; i++) {
  largeDataset.push({
    term_code: '2025-1',
    subject_code: `TEST ${String(i).padStart(4, '0')}`,
    section: 'A',
    department: 'TEST',
    course_title: `Test Course ${i}`,
    units: 3,
    time_pattern: 'MWF 0900-1030',
    room: 'TEST-101',
    instructor: 'Test Instructor',
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
console.log(`   ✅ Created ${largeDataset.length} mock schedule records\n`);

// Test the SupabaseManager with batching
console.log('🧪 Testing SupabaseManager batching logic...\n');

const supabase = new TestSupabaseManager('test-token-12345');

console.log(`📊 Supabase URL: ${supabase.url}\n`);

// Test syncing with batching
await supabase.syncToSupabase('schedules', largeDataset, '2025-1', 'ALL');

console.log('\n═══════════════════════════════════════════════════════');
console.log('📋 Verification Results:\n');

// Verify batching (default batch size is now 2000)
const DEFAULT_BATCH_SIZE = 2000;
const expectedBatches = Math.ceil(largeDataset.length / DEFAULT_BATCH_SIZE);
console.log(`✓ Expected batches: ${expectedBatches}`);
console.log(`✓ Actual requests sent: ${capturedRequests.length}`);
console.log(`✓ Batching ${capturedRequests.length === expectedBatches ? '✅ CORRECT' : '❌ FAILED'}\n`);

// Verify request structure
console.log('🔍 Verifying request structure...');
const firstRequest = capturedRequests[0];

console.log(`\n📦 First Request Structure:`);
console.log(`   URL: ${firstRequest.url}`);
console.log(`   Authorization header: ${firstRequest.headers.Authorization ? '✅ Present' : '❌ Missing'}`);
console.log(`   Content-Type: ${firstRequest.headers['Content-Type']}`);

console.log(`\n📄 Payload Structure:`);
console.log(`   data_type: ${firstRequest.payload.data_type}`);
console.log(`   records.length: ${firstRequest.payload.records.length}`);
console.log(`   metadata keys: ${Object.keys(firstRequest.payload.metadata).join(', ')}`);

// Verify metadata fields
const metadata = firstRequest.payload.metadata;
console.log(`\n🔖 Metadata Fields:`);
console.log(`   ✓ term_code: ${metadata.term_code || 'missing'}`);
console.log(`   ✓ department: ${metadata.department || 'missing'}`);
console.log(`   ✓ replace_existing: ${metadata.replace_existing !== undefined ? metadata.replace_existing : 'missing'}`);
console.log(`   ✓ record_count: ${metadata.record_count || 'missing'}`);
console.log(`   ✓ workflow_name: ${metadata.workflow_name || 'missing'}`);
console.log(`   ✓ run_id: ${metadata.run_id || 'missing'}`);
console.log(`   ✓ run_url: ${metadata.run_url || 'missing'}`);
console.log(`   ✓ repository: ${metadata.repository || 'missing'}`);
console.log(`   ✓ commit_sha: ${metadata.commit_sha || 'missing'}`);
console.log(`   ✓ trigger: ${metadata.trigger || 'missing'}`);

// Check all required fields are present
const requiredMetadataFields = [
  'term_code', 'department', 'workflow_name', 'run_id', 
  'run_url', 'repository', 'commit_sha', 'trigger', 'record_count'
];
const missingFields = requiredMetadataFields.filter(field => !metadata[field]);

console.log(`\n📊 Metadata Validation:`);
if (missingFields.length === 0) {
  console.log(`   ✅ All required metadata fields present`);
} else {
  console.log(`   ❌ Missing fields: ${missingFields.join(', ')}`);
}

// Verify batch sizes
console.log(`\n📏 Batch Sizes:`);
capturedRequests.forEach((req, index) => {
  const batchNum = index + 1;
  const recordCount = req.payload.records.length;
  const expected = index < capturedRequests.length - 1 ? DEFAULT_BATCH_SIZE : largeDataset.length % DEFAULT_BATCH_SIZE || DEFAULT_BATCH_SIZE;
  console.log(`   Batch ${batchNum}: ${recordCount} records ${recordCount === expected ? '✅' : '❌'}`);
});

// CRITICAL: Verify replace_existing behavior for schedules batching
console.log(`\n🔄 Replace Existing Behavior (Critical for Data Loss Prevention):`);
let replaceExistingCorrect = true;
capturedRequests.forEach((req, index) => {
  const batchNum = index + 1;
  const replaceExisting = req.payload.metadata.replace_existing;
  const isFirstBatch = index === 0;
  const expectedValue = isFirstBatch;
  const isCorrect = replaceExisting === expectedValue;
  
  if (!isCorrect) replaceExistingCorrect = false;
  
  console.log(`   Batch ${batchNum}: replace_existing=${replaceExisting} (expected: ${expectedValue}) ${isCorrect ? '✅' : '❌'}`);
  if (isFirstBatch) {
    console.log(`      → First batch should clear old data for the term`);
  } else {
    console.log(`      → Subsequent batch should append without deleting existing data`);
  }
});

// Verify total records
const totalRecordsSent = capturedRequests.reduce((sum, req) => sum + req.payload.records.length, 0);
console.log(`\n📊 Total Records:`);
console.log(`   Expected: ${largeDataset.length}`);
console.log(`   Sent: ${totalRecordsSent}`);
console.log(`   Match: ${totalRecordsSent === largeDataset.length ? '✅' : '❌'}`);

// Final summary
console.log('\n═══════════════════════════════════════════════════════');
if (
  capturedRequests.length === expectedBatches &&
  missingFields.length === 0 &&
  totalRecordsSent === largeDataset.length &&
  firstRequest.headers.Authorization === 'Bearer test-token-12345' &&
  replaceExistingCorrect
) {
  console.log('✅ ALL TESTS PASSED!\n');
  console.log('✓ Client-side batching works correctly (2000 records per batch)');
  console.log('✓ All metadata fields are included');
  console.log('✓ Authorization header is set correctly');
  console.log('✓ All records are sent without loss');
  console.log('✓ replace_existing behavior correct:');
  console.log('  - First batch: replace_existing=true (clears old data)');
  console.log('  - Subsequent batches: replace_existing=false (append mode)');
  console.log('\n🎉 Data loss prevention mechanism validated!');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED\n');
  if (!replaceExistingCorrect) {
    console.log('⚠️  CRITICAL: replace_existing behavior is incorrect!');
    console.log('   This could lead to data loss during multi-batch ingestion.');
  }
  process.exit(1);
}
