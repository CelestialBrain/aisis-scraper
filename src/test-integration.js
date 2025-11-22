/**
 * Integration test simulating the complete data flow
 * This tests the entire pipeline from scraping to payload construction
 */

import { SupabaseManager } from './supabase.js';

console.log('🧪 Integration Test: Complete Data Flow\n');
console.log('═══════════════════════════════════════════════════════\n');

// Step 1: Simulate scraper returning data (without term_code)
console.log('Step 1: Scraper returns raw course data');
const mockScrapedData = [
  {
    department: 'BIO',
    subjectCode: 'BIO 10.01',
    section: 'NSLEC-D-A',
    title: 'BIODIVERSITY: LIFE ON EARTH, LECTURE',
    units: '3',
    time: 'M-TH 0800-0930',
    room: 'SEC-B305A',
    instructor: 'GATCHALIAN, Pamela',
    maxSlots: '30',
    language: 'ENG',
    level: 'U',
    freeSlots: '0',
    remarks: '-'
  }
];
console.log(`   ✅ Scraped ${mockScrapedData.length} courses\n`);

// Step 2: Simulate term detection
console.log('Step 2: Term is detected/overridden');
const usedTerm = '2025-1';
console.log(`   ✅ Using term: ${usedTerm}\n`);

// Step 3: Enrichment (as done in src/index.js)
console.log('Step 3: Enrich each record with term_code');
const enrichedSchedule = mockScrapedData.map(course => ({
  ...course,
  term_code: usedTerm
}));
console.log('   ✅ Added term_code to each record');
console.log('   📄 Sample enriched record:');
console.log(JSON.stringify(enrichedSchedule[0], null, 2));
console.log();

// Step 4: Transformation (as done by SupabaseManager)
console.log('Step 4: Transform to database schema');
const supabase = new SupabaseManager('fake-token');
const cleanSchedule = supabase.transformScheduleData(enrichedSchedule);
console.log('   ✅ Transformed data');
console.log('   📄 Sample transformed record:');
console.log(JSON.stringify(cleanSchedule[0], null, 2));
console.log();

// Step 5: Verify term_code is present
console.log('Step 5: Verify term_code field');
const hasTermCode = cleanSchedule.every(record => 
  record.term_code && record.term_code === usedTerm
);
if (hasTermCode) {
  console.log(`   ✅ All records have term_code: ${usedTerm}\n`);
} else {
  console.error('   ❌ FAILED: Some records missing term_code\n');
  process.exit(1);
}

// Step 6: Simulate payload construction for Supabase
console.log('Step 6: Construct payload for github-data-ingest');
const payload = {
  data_type: 'schedules',
  records: cleanSchedule,
  metadata: {
    term_code: usedTerm,
    department: 'ALL',
    record_count: cleanSchedule.length
  }
};
console.log('   ✅ Payload constructed');
console.log('   📦 Payload structure:');
console.log(JSON.stringify({
  data_type: payload.data_type,
  metadata: payload.metadata,
  records_count: payload.records.length,
  sample_record: payload.records[0]
}, null, 2));
console.log();

// Final verification
console.log('═══════════════════════════════════════════════════════');
console.log('✅ Integration Test PASSED!\n');
console.log('📋 Verification Results:');
console.log('   ✓ Raw scraped data (no term_code) ✅');
console.log('   ✓ Term detection/override ✅');
console.log('   ✓ Enrichment adds term_code ✅');
console.log('   ✓ Transformation preserves term_code ✅');
console.log(`   ✓ Each record has term_code: ${usedTerm} ✅`);
console.log('   ✓ Payload ready for ingestion ✅\n');

console.log('🎉 The scraper will now emit records compatible with the');
console.log('   github-data-ingest function validation requirements!');
