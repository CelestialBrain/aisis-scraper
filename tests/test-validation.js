/**
 * Test validation utilities
 */

import { isHeaderLikeRecord, validateScheduleRecord } from '../src/constants.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Validation Utilities');
console.log('═══════════════════════════════════════════════════════\n');

// Test isHeaderLikeRecord
console.log('Test 1: Header Detection');
console.log('─────────────────────────────────────────────────────\n');

const testCases = [
  {
    name: 'Valid course record',
    record: {
      subject_code: 'ENLL 101',
      section: 'A',
      course_title: 'Introduction to Literature',
      department: 'ENLL',
      term_code: '2025-1'
    },
    expectedHeader: false,
    expectedValid: true
  },
  {
    name: 'Header row - SUBJECT CODE',
    record: {
      subject_code: 'SUBJECT CODE',
      section: 'SECTION',
      course_title: 'COURSE TITLE',
      department: 'DEPT',
      term_code: '2025-1'
    },
    expectedHeader: true,
    expectedValid: true  // Has required fields but is a header
  },
  {
    name: 'Header row - uppercase variations',
    record: {
      subject_code: 'CODE',
      section: 'SEC',
      course_title: 'TITLE',
      department: 'DEPT',
      term_code: '2025-1'
    },
    expectedHeader: true,
    expectedValid: true
  },
  {
    name: 'Empty record',
    record: {
      subject_code: '',
      section: '',
      course_title: '',
      department: '',
      term_code: ''
    },
    expectedHeader: true,  // Empty = header-like
    expectedValid: false
  },
  {
    name: 'Missing term_code',
    record: {
      subject_code: 'ENLL 101',
      section: 'A',
      course_title: 'Introduction to Literature',
      department: 'ENLL'
    },
    expectedHeader: false,
    expectedValid: false
  },
  {
    name: 'Raw format (subjectCode instead of subject_code)',
    record: {
      subjectCode: 'ENLL 101',
      section: 'A',
      title: 'Introduction to Literature',
      department: 'ENLL',
      term_code: '2025-1'
    },
    expectedHeader: false,
    expectedValid: true
  },
  {
    name: 'Doctoral course with special characters',
    record: {
      subject_code: 'ENLL 399.7',
      section: 'SUB-B',
      course_title: 'FINAL PAPER SUBMISSION (DOCTORAL)',
      department: 'ENLL',
      term_code: '2025-1'
    },
    expectedHeader: false,
    expectedValid: true
  }
];

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  console.log(`Test Case ${index + 1}: ${test.name}`);
  
  const isHeader = isHeaderLikeRecord(test.record);
  const isValid = validateScheduleRecord(test.record);
  
  const headerPass = isHeader === test.expectedHeader;
  const validPass = isValid === test.expectedValid;
  
  if (headerPass && validPass) {
    console.log(`   ✅ PASS`);
    console.log(`      isHeader: ${isHeader} (expected: ${test.expectedHeader})`);
    console.log(`      isValid: ${isValid} (expected: ${test.expectedValid})`);
    passed++;
  } else {
    console.log(`   ❌ FAIL`);
    console.log(`      isHeader: ${isHeader} (expected: ${test.expectedHeader}) ${headerPass ? '✓' : '✗'}`);
    console.log(`      isValid: ${isValid} (expected: ${test.expectedValid}) ${validPass ? '✓' : '✗'}`);
    failed++;
  }
  console.log();
});

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('📊 Test Summary');
console.log('═══════════════════════════════════════════════════════\n');
console.log(`Total tests: ${testCases.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}\n`);

if (failed === 0) {
  console.log('✅ All validation tests passed!\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!\n');
  process.exit(1);
}
