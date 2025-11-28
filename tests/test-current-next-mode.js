/**
 * Test the current_next scrape mode logic
 * 
 * This tests:
 * 1. Term utils helper functions
 * 2. current_next mode term selection logic
 * 3. Integration with existing term handling
 */

import { strict as assert } from 'assert';
import { compareTermCodes } from '../src/scraper.js';
import { 
  getNextTerm, 
  getCurrentAndNextTerms, 
  findNextAvailableTerm,
  parseTermCode,
  getSemesterLabel,
  formatTermLabel 
} from '../src/term-utils.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Current + Next Term Mode Logic');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: getNextTerm - normal cases
console.log('Test 1: getNextTerm() calculates next term correctly');
{
  // Normal progressions
  assert.strictEqual(getNextTerm('2025-0'), '2025-1', 'Intersession → First Semester');
  assert.strictEqual(getNextTerm('2025-1'), '2025-2', 'First Semester → Second Semester');
  assert.strictEqual(getNextTerm('2025-2'), '2026-0', 'Second Semester → Next Year Intersession');
  
  // Year boundaries
  assert.strictEqual(getNextTerm('2024-2'), '2025-0', 'Year rollover from 2024');
  assert.strictEqual(getNextTerm('2023-2'), '2024-0', 'Year rollover from 2023');
  
  console.log('   ✅ Normal term progressions work correctly\n');
}

// Test 2: getNextTerm - edge cases
console.log('Test 2: getNextTerm() handles edge cases');
{
  // Invalid inputs
  assert.strictEqual(getNextTerm(null), null, 'null should return null');
  assert.strictEqual(getNextTerm(undefined), null, 'undefined should return null');
  assert.strictEqual(getNextTerm(''), null, 'empty string should return null');
  assert.strictEqual(getNextTerm('invalid'), null, 'invalid string should return null');
  assert.strictEqual(getNextTerm('2025'), null, 'year only should return null');
  
  // Short year format - JavaScript parseInt accepts '25' as 25, so it produces '25-2'
  // This is technically a valid output from the function's perspective
  // In practice, AISIS always uses 4-digit years so this case won't occur
  assert.strictEqual(getNextTerm('25-1'), '25-2', 'Short year format produces short year result');
  
  // Invalid semester value should return null
  assert.strictEqual(getNextTerm('2025-3'), null, 'Invalid semester (3) should return null');
  assert.strictEqual(getNextTerm('2025-9'), null, 'Invalid semester (9) should return null');
  
  console.log('   ✅ Edge cases handled correctly\n');
}

// Test 3: getCurrentAndNextTerms
console.log('Test 3: getCurrentAndNextTerms() returns both terms');
{
  // Normal cases
  assert.deepStrictEqual(
    getCurrentAndNextTerms('2025-0'), 
    ['2025-0', '2025-1'], 
    'Intersession + First Semester'
  );
  assert.deepStrictEqual(
    getCurrentAndNextTerms('2025-1'), 
    ['2025-1', '2025-2'], 
    'First Semester + Second Semester'
  );
  assert.deepStrictEqual(
    getCurrentAndNextTerms('2025-2'), 
    ['2025-2', '2026-0'], 
    'Second Semester + Next Year Intersession'
  );
  
  // Invalid input
  assert.deepStrictEqual(
    getCurrentAndNextTerms(null), 
    [], 
    'null returns empty array'
  );
  
  console.log('   ✅ Both current and next terms returned correctly\n');
}

// Test 4: findNextAvailableTerm - next term exists
console.log('Test 4: findNextAvailableTerm() finds next term in available terms');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false }
  ];
  
  assert.strictEqual(
    findNextAvailableTerm(availableTerms, '2025-1'), 
    '2025-2', 
    'Next term after 2025-1 is 2025-2'
  );
  assert.strictEqual(
    findNextAvailableTerm(availableTerms, '2025-2'), 
    '2026-0', 
    'Next term after 2025-2 is 2026-0'
  );
  
  console.log('   ✅ Correctly finds next term in available terms\n');
}

// Test 5: findNextAvailableTerm - next term not available
console.log('Test 5: findNextAvailableTerm() handles missing next term');
{
  const limitedTerms = [
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false }
  ];
  
  // 2025-2 is not in the list, so should return null
  assert.strictEqual(
    findNextAvailableTerm(limitedTerms, '2025-1'), 
    null, 
    'Returns null when next term not available'
  );
  
  console.log('   ✅ Correctly handles missing next term\n');
}

// Test 6: current_next mode simulation
console.log('Test 6: Simulate current_next mode term selection');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false }
  ];
  
  // Simulate what src/index.js does in current_next mode
  const currentTermObj = availableTerms.find(t => t.selected);
  const currentTerm = currentTermObj.value;
  const nextTerm = findNextAvailableTerm(availableTerms, currentTerm);
  
  let termsToScrape = [currentTerm];
  if (nextTerm) {
    termsToScrape.push(nextTerm);
  }
  
  assert.deepStrictEqual(
    termsToScrape,
    ['2025-1', '2025-2'],
    'current_next mode selects current + next term'
  );
  
  console.log('   Current term:', currentTerm);
  console.log('   Next term:', nextTerm);
  console.log('   Terms to scrape:', termsToScrape);
  console.log('   ✅ current_next mode correctly selects two terms\n');
}

// Test 7: current_next mode when next term is not yet available
console.log('Test 7: current_next mode when next term not in AISIS');
{
  // Simulates end of academic year when next intersession isn't published yet
  const availableTerms = [
    { value: '2025-1', label: '2025-2026-First Semester', selected: false },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: true }
    // Note: 2026-0 not yet available
  ];
  
  const currentTermObj = availableTerms.find(t => t.selected);
  const currentTerm = currentTermObj.value;
  const nextTerm = findNextAvailableTerm(availableTerms, currentTerm);
  
  let termsToScrape = [currentTerm];
  if (nextTerm) {
    termsToScrape.push(nextTerm);
  }
  
  assert.deepStrictEqual(
    termsToScrape,
    ['2025-2'],
    'current_next mode falls back to current only when next not available'
  );
  
  console.log('   Current term:', currentTerm);
  console.log('   Next term:', nextTerm, '(not yet in AISIS)');
  console.log('   Terms to scrape:', termsToScrape);
  console.log('   ✅ Gracefully handles missing next term\n');
}

// Test 8: parseTermCode
console.log('Test 8: parseTermCode() parses term components');
{
  assert.deepStrictEqual(
    parseTermCode('2025-1'), 
    { year: 2025, semester: 1 },
    'Parses valid term'
  );
  assert.strictEqual(parseTermCode('invalid'), null, 'Returns null for invalid');
  assert.strictEqual(parseTermCode(null), null, 'Returns null for null');
  
  console.log('   ✅ Term code parsing works correctly\n');
}

// Test 9: getSemesterLabel
console.log('Test 9: getSemesterLabel() returns human-readable labels');
{
  assert.strictEqual(getSemesterLabel(0), 'Intersession', 'Semester 0');
  assert.strictEqual(getSemesterLabel(1), 'First Semester', 'Semester 1');
  assert.strictEqual(getSemesterLabel(2), 'Second Semester', 'Semester 2');
  assert.strictEqual(getSemesterLabel(5), 'Semester 5', 'Unknown semester');
  
  console.log('   ✅ Semester labels correct\n');
}

// Test 10: formatTermLabel
console.log('Test 10: formatTermLabel() formats term codes nicely');
{
  assert.strictEqual(
    formatTermLabel('2025-0'), 
    '2025-2026 Intersession',
    'Intersession format'
  );
  assert.strictEqual(
    formatTermLabel('2025-1'), 
    '2025-2026 First Semester',
    'First semester format'
  );
  assert.strictEqual(
    formatTermLabel('2025-2'), 
    '2025-2026 Second Semester',
    'Second semester format'
  );
  assert.strictEqual(
    formatTermLabel('invalid'), 
    'invalid',
    'Invalid passthrough'
  );
  
  console.log('   ✅ Term formatting works correctly\n');
}

// Test 11: Integration with compareTermCodes
console.log('Test 11: Integration with compareTermCodes()');
{
  // Verify that terms from getCurrentAndNextTerms are in correct order
  const terms = getCurrentAndNextTerms('2025-1');
  
  // First term should be less than second term
  assert.strictEqual(
    compareTermCodes(terms[0], terms[1]) < 0,
    true,
    'Current term should be before next term'
  );
  
  // Verify across year boundary
  const yearBoundaryTerms = getCurrentAndNextTerms('2025-2');
  assert.strictEqual(
    compareTermCodes(yearBoundaryTerms[0], yearBoundaryTerms[1]) < 0,
    true,
    'Year boundary: 2025-2 should be before 2026-0'
  );
  
  console.log('   ✅ Terms are in correct chronological order\n');
}

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All current_next mode tests passed!');
console.log('═══════════════════════════════════════════════════════');
