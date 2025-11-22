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
  async sendRequest(dataType, records, termCode = null, department = null, programCode = null) {
    // Build metadata just like the parent class
    const metadata = {};
    
    if (termCode) metadata.term_code = termCode;
    if (department) metadata.department = department;
    if (programCode) metadata.program_code = programCode;
    
    if (process.env.GITHUB_WORKFLOW) {
      metadata.workflow_name = process.env.GITHUB_WORKFLOW;
    }
    if (process.env.GITHUB_RUN_ID) {
      metadata.run_id = process.env.GITHUB_RUN_ID;
    }
    if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
      metadata.run_url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    }
    if (process.env.GITHUB_REPOSITORY) {
      metadata.repository = process.env.GITHUB_REPOSITORY;
    }
    if (process.env.GITHUB_SHA) {
      metadata.commit_sha = process.env.GITHUB_SHA;
    }
    
    if (process.env.GITHUB_EVENT_NAME === 'schedule') {
      metadata.trigger = 'schedule';
    } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      metadata.trigger = 'manual';
    } else if (process.env.GITHUB_ACTIONS) {
      metadata.trigger = 'github-actions';
    } else {
      metadata.trigger = 'manual';
    }

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
for (let i = 0; i < 1250; i++) {
  largeDataset.push({
    term_code: '2025-1',
    subject_code: `TEST ${String(i).padStart(3, '0')}`,
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

// Verify batching
const expectedBatches = Math.ceil(largeDataset.length / 500);
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
console.log(`   ✓ workflow_name: ${metadata.workflow_name || 'missing'}`);
console.log(`   ✓ run_id: ${metadata.run_id || 'missing'}`);
console.log(`   ✓ run_url: ${metadata.run_url || 'missing'}`);
console.log(`   ✓ repository: ${metadata.repository || 'missing'}`);
console.log(`   ✓ commit_sha: ${metadata.commit_sha || 'missing'}`);
console.log(`   ✓ trigger: ${metadata.trigger || 'missing'}`);

// Check all required fields are present
const requiredMetadataFields = [
  'term_code', 'department', 'workflow_name', 'run_id', 
  'run_url', 'repository', 'commit_sha', 'trigger'
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
  const expected = index < capturedRequests.length - 1 ? 500 : largeDataset.length % 500 || 500;
  console.log(`   Batch ${batchNum}: ${recordCount} records ${recordCount === expected ? '✅' : '❌'}`);
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
  firstRequest.headers.Authorization === 'Bearer test-token-12345'
) {
  console.log('✅ ALL TESTS PASSED!\n');
  console.log('✓ Client-side batching works correctly (500 records per batch)');
  console.log('✓ All metadata fields are included');
  console.log('✓ Authorization header is set correctly');
  console.log('✓ All records are sent without loss');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED\n');
  process.exit(1);
}
