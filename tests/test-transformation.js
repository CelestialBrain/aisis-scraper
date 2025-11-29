/**
 * Test transformation validation
 */

import { SupabaseManager } from '../src/supabase.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Transformation Validation');
console.log('═══════════════════════════════════════════════════════\n');

// Provide a test URL since SUPABASE_URL is now required
const supabase = new SupabaseManager('fake-token', 'https://test.supabase.co');

// Test data with valid, header, and invalid records
const testData = [
  // Valid record
  {
    department: 'ENLL',
    subjectCode: 'ENLL 101',
    section: 'A',
    title: 'Introduction to Literature',
    units: '3',
    time: 'MWF 10:00-11:00',
    room: 'SEC-A101',
    instructor: 'DOE, JOHN',
    maxSlots: '30',
    language: 'ENG',
    level: 'U',
    freeSlots: '5',
    remarks: '',
    term_code: '2025-1'
  },
  // Header record - should be filtered
  {
    department: 'DEPT',
    subjectCode: 'SUBJECT CODE',
    section: 'SECTION',
    title: 'COURSE TITLE',
    units: 'UNITS',
    time: 'TIME',
    room: 'ROOM',
    instructor: 'INSTRUCTOR',
    maxSlots: '',
    language: '',
    level: '',
    freeSlots: '',
    remarks: '',
    term_code: '2025-1'
  },
  // Valid record
  {
    department: 'ENLL',
    subjectCode: 'ENLL 399.7',
    section: 'SUB-B',
    title: 'FINAL PAPER SUBMISSION (DOCTORAL)',
    units: '0',
    time: 'TBA (~)',
    room: 'TBA',
    instructor: 'ADVISOR',
    maxSlots: '1',
    language: 'ENG',
    level: 'G',
    freeSlots: '0',
    remarks: 'Terminal',
    term_code: '2025-1'
  },
  // Invalid record - missing term_code (should be filtered by validation)
  {
    department: 'BIO',
    subjectCode: 'BIO 101',
    section: 'A',
    title: 'Biology',
    units: '3',
    time: 'TTH 14:00-15:30',
    room: 'SCI-101',
    instructor: 'SMITH, JANE',
    maxSlots: '25',
    language: 'ENG',
    level: 'U',
    freeSlots: '10',
    remarks: ''
    // Missing term_code
  }
];

console.log(`Input: ${testData.length} records`);
console.log(`  - 2 valid records`);
console.log(`  - 1 header record (should be filtered)`);
console.log(`  - 1 invalid record (missing term_code, should be filtered)\n`);

// Set debug mode to see the filtering logs
process.env.DEBUG_SCRAPER = 'true';

const transformed = supabase.transformScheduleData(testData);

console.log(`\nOutput: ${transformed.length} records\n`);

// Verify results
const expectedCount = 2;  // Only the 2 valid records should remain
const actualCount = transformed.length;

if (actualCount === expectedCount) {
  console.log(`✅ Transformation test PASSED!`);
  console.log(`   Expected ${expectedCount} records, got ${actualCount}`);
  
  // Verify the valid records have correct structure
  const hasRequiredFields = transformed.every(record => 
    record.term_code && 
    record.subject_code && 
    record.section && 
    record.department
  );
  
  if (hasRequiredFields) {
    console.log(`✅ All output records have required fields`);
  } else {
    console.log(`❌ Some output records missing required fields`);
    process.exit(1);
  }
  
  // Show sample output
  console.log(`\n📄 Sample transformed record:`);
  console.log(JSON.stringify(transformed[0], null, 2));
  
  process.exit(0);
} else {
  console.log(`❌ Transformation test FAILED!`);
  console.log(`   Expected ${expectedCount} records, got ${actualCount}`);
  process.exit(1);
}
