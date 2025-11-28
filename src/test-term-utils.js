/**
 * Test script for term-utils.js
 * 
 * Run: node src/test-term-utils.js
 */

import {
  getNextTerm,
  getCurrentAndNextTerms,
  findNextAvailableTerm,
  parseTermCode,
  getSemesterLabel,
  formatTermLabel
} from './term-utils.js';

console.log('🧪 Testing term-utils.js\n');

// Test getNextTerm
console.log('=== getNextTerm ===');
const nextTermTests = [
  { input: '2025-0', expected: '2025-1', desc: 'Intersession → First Semester' },
  { input: '2025-1', expected: '2025-2', desc: 'First Semester → Second Semester' },
  { input: '2025-2', expected: '2026-0', desc: 'Second Semester → Next Year Intersession' },
  { input: '2024-2', expected: '2025-0', desc: 'Year rollover from 2024' },
  { input: null, expected: null, desc: 'Null input' },
  { input: '', expected: null, desc: 'Empty string' },
  { input: 'invalid', expected: null, desc: 'Invalid format' },
  { input: '2025', expected: null, desc: 'Missing semester' },
  { input: '2025-3', expected: null, desc: 'Invalid semester (3)' },
  { input: '2025-9', expected: null, desc: 'Invalid semester (9)' },
];

let passed = 0;
let failed = 0;

for (const test of nextTermTests) {
  const result = getNextTerm(test.input);
  const success = result === test.expected;
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: "${test.input}" → "${result}"`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: "${test.input}" → "${result}" (expected: "${test.expected}")`);
  }
}

// Test getCurrentAndNextTerms
console.log('\n=== getCurrentAndNextTerms ===');
const currentNextTests = [
  { input: '2025-1', expected: ['2025-1', '2025-2'], desc: 'Normal case' },
  { input: '2025-2', expected: ['2025-2', '2026-0'], desc: 'Year rollover' },
  { input: null, expected: [], desc: 'Null input' },
];

for (const test of currentNextTests) {
  const result = getCurrentAndNextTerms(test.input);
  const success = JSON.stringify(result) === JSON.stringify(test.expected);
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: "${test.input}" → [${result.join(', ')}]`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: "${test.input}" → [${result.join(', ')}] (expected: [${test.expected.join(', ')}])`);
  }
}

// Test findNextAvailableTerm
console.log('\n=== findNextAvailableTerm ===');
const mockAvailableTerms = [
  { value: '2025-1', label: '2025-2026-First Semester', selected: true },
  { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
  { value: '2026-0', label: '2026-2027-Intersession', selected: false },
];

const findNextTests = [
  { currentTerm: '2025-1', expected: '2025-2', desc: 'Next term exists' },
  { currentTerm: '2025-2', expected: '2026-0', desc: 'Next year term exists' },
  { currentTerm: '2026-0', expected: null, desc: 'No next term available' },
  { currentTerm: null, expected: null, desc: 'Null input' },
];

for (const test of findNextTests) {
  const result = findNextAvailableTerm(mockAvailableTerms, test.currentTerm);
  const success = result === test.expected;
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: "${test.currentTerm}" → "${result}"`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: "${test.currentTerm}" → "${result}" (expected: "${test.expected}")`);
  }
}

// Test parseTermCode
console.log('\n=== parseTermCode ===');
const parseTests = [
  { input: '2025-1', expected: { year: 2025, semester: 1 }, desc: 'Valid term' },
  { input: 'invalid', expected: null, desc: 'Invalid format' },
];

for (const test of parseTests) {
  const result = parseTermCode(test.input);
  const success = JSON.stringify(result) === JSON.stringify(test.expected);
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: "${test.input}" → ${JSON.stringify(result)}`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: "${test.input}" → ${JSON.stringify(result)} (expected: ${JSON.stringify(test.expected)})`);
  }
}

// Test getSemesterLabel
console.log('\n=== getSemesterLabel ===');
const labelTests = [
  { input: 0, expected: 'Intersession', desc: 'Intersession' },
  { input: 1, expected: 'First Semester', desc: 'First Semester' },
  { input: 2, expected: 'Second Semester', desc: 'Second Semester' },
  { input: 3, expected: 'Semester 3', desc: 'Unknown semester' },
];

for (const test of labelTests) {
  const result = getSemesterLabel(test.input);
  const success = result === test.expected;
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: ${test.input} → "${result}"`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: ${test.input} → "${result}" (expected: "${test.expected}")`);
  }
}

// Test formatTermLabel
console.log('\n=== formatTermLabel ===');
const formatTests = [
  { input: '2025-0', expected: '2025-2026 Intersession', desc: 'Intersession format' },
  { input: '2025-1', expected: '2025-2026 First Semester', desc: 'First semester format' },
  { input: '2025-2', expected: '2025-2026 Second Semester', desc: 'Second semester format' },
  { input: 'invalid', expected: 'invalid', desc: 'Invalid format passthrough' },
];

for (const test of formatTests) {
  const result = formatTermLabel(test.input);
  const success = result === test.expected;
  if (success) {
    passed++;
    console.log(`  ✅ ${test.desc}: "${test.input}" → "${result}"`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: "${test.input}" → "${result}" (expected: "${test.expected}")`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
