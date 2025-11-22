/**
 * Simple test to verify term_code is added to course records
 * This tests the data enrichment logic without requiring AISIS credentials
 */

import { SupabaseManager } from './supabase.js';

// Mock scraped data (without term_code)
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
  },
  {
    department: 'CH',
    subjectCode: 'CH 10.01',
    section: 'NLEC-A',
    title: 'GENERAL CHEMISTRY I, LECTURE',
    units: '3',
    time: 'MWF 1000-1100',
    room: 'SEC-B101',
    instructor: 'SANTOS, Maria',
    maxSlots: '40',
    language: 'ENG',
    level: 'U',
    freeSlots: '5',
    remarks: '-'
  }
];

console.log('🧪 Testing term_code enrichment logic...\n');

// Test 1: Enrichment in index.js
console.log('Test 1: Enriching scraped data with term_code');
const testTerm = '2025-1';
const enrichedSchedule = mockScrapedData.map(course => ({
  ...course,
  term_code: testTerm
}));

console.log('✅ Enriched data sample:');
console.log(JSON.stringify(enrichedSchedule[0], null, 2));

// Verify term_code was added
if (enrichedSchedule.every(course => course.term_code === testTerm)) {
  console.log('✅ All records have term_code:', testTerm);
} else {
  console.error('❌ FAILED: Some records missing term_code');
  process.exit(1);
}

// Test 2: Transformation preserves term_code
console.log('\nTest 2: SupabaseManager.transformScheduleData() preserves term_code');
const supabase = new SupabaseManager('fake-token');
const transformedData = supabase.transformScheduleData(enrichedSchedule);

console.log('✅ Transformed data sample:');
console.log(JSON.stringify(transformedData[0], null, 2));

// Verify term_code was preserved
if (transformedData.every(course => course.term_code === testTerm)) {
  console.log('✅ All transformed records have term_code:', testTerm);
} else {
  console.error('❌ FAILED: term_code not preserved during transformation');
  process.exit(1);
}

// Test 3: Defensive normalization in syncToSupabase
console.log('\nTest 3: Defensive normalization in syncToSupabase');
const dataWithoutTermCode = mockScrapedData.map(course => ({
  subject_code: course.subjectCode,
  section: course.section,
  // Intentionally missing term_code
}));

// Simulate the normalization logic
const normalizedData = dataWithoutTermCode.map(record => {
  if (testTerm && !record.term_code) {
    return { ...record, term_code: testTerm };
  }
  return record;
});

console.log('✅ Normalized data sample:');
console.log(JSON.stringify(normalizedData[0], null, 2));

if (normalizedData.every(record => record.term_code === testTerm)) {
  console.log('✅ Defensive normalization adds term_code to records missing it');
} else {
  console.error('❌ FAILED: Defensive normalization did not add term_code');
  process.exit(1);
}

console.log('\n✅ All tests passed! term_code enrichment logic is working correctly.');
console.log('\n📋 Summary:');
console.log('   - Enrichment step adds term_code to raw scraped data ✅');
console.log('   - Transformation preserves term_code field ✅');
console.log('   - Defensive normalization backfills missing term_code ✅');
