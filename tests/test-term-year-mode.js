/**
 * Test the term year filtering logic for the 'year' scrape mode
 * 
 * This tests:
 * 1. getTermYear() helper function
 * 2. Year mode term filtering logic
 * 3. Edge cases with intersession terms
 */

import { strict as assert } from 'assert';
import { compareTermCodes } from '../src/scraper.js';
import { getTermYear } from '../src/constants.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Term Year Mode Logic');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: getTermYear helper function
console.log('Test 1: getTermYear() extracts year from term codes');
{
  // Valid term codes
  assert.strictEqual(getTermYear('2025-1'), '2025', '2025-1 should return 2025');
  assert.strictEqual(getTermYear('2025-0'), '2025', '2025-0 should return 2025');
  assert.strictEqual(getTermYear('2025-2'), '2025', '2025-2 should return 2025');
  assert.strictEqual(getTermYear('2024-1'), '2024', '2024-1 should return 2024');
  assert.strictEqual(getTermYear('2024-2'), '2024', '2024-2 should return 2024');
  assert.strictEqual(getTermYear('2026-0'), '2026', '2026-0 should return 2026');
  
  // Invalid term codes
  assert.strictEqual(getTermYear(null), null, 'null should return null');
  assert.strictEqual(getTermYear(undefined), null, 'undefined should return null');
  assert.strictEqual(getTermYear(''), null, 'empty string should return null');
  assert.strictEqual(getTermYear('invalid'), null, 'invalid string should return null');
  assert.strictEqual(getTermYear('25-1'), null, '2-digit year should return null');
  assert.strictEqual(getTermYear('2025'), null, 'year only should return null');
  assert.strictEqual(getTermYear('2025-'), null, 'year with dash but no semester should return null');
  
  console.log('   ✅ getTermYear() works correctly\n');
}

// Test 2: Year mode filtering - regular semester as current term
console.log('Test 2: Year mode filtering with 2025-1 as current term');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false }
  ];
  
  const currentTerm = availableTerms.find(t => t.selected);
  assert.ok(currentTerm, 'Should find current term');
  assert.strictEqual(currentTerm.value, '2025-1', 'Current term should be 2025-1');
  
  const currentYear = getTermYear(currentTerm.value);
  assert.strictEqual(currentYear, '2025', 'Current year should be 2025');
  
  // Filter terms by year
  const termsInYear = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  assert.deepStrictEqual(
    termsInYear, 
    ['2025-0', '2025-1', '2025-2'],
    'Should filter to 2025-* terms only'
  );
  
  // Verify 2024 and 2026 terms are excluded
  assert.ok(!termsInYear.includes('2024-2'), '2024-2 should not be included');
  assert.ok(!termsInYear.includes('2026-0'), '2026-0 should not be included');
  
  // Verify intersession (2025-0) IS included
  assert.ok(termsInYear.includes('2025-0'), '2025-0 (intersession) should be included');
  
  console.log('   ✅ Year mode correctly includes 2025-0, 2025-1, 2025-2\n');
}

// Test 3: Year mode filtering - intersession as current term
console.log('Test 3: Year mode filtering with 2025-0 (intersession) as current term');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: true }, // Intersession is current
    { value: '2025-1', label: '2025-2026-First Semester', selected: false },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false }
  ];
  
  const currentTerm = availableTerms.find(t => t.selected);
  assert.ok(currentTerm, 'Should find current term');
  assert.strictEqual(currentTerm.value, '2025-0', 'Current term should be 2025-0');
  
  const currentYear = getTermYear(currentTerm.value);
  assert.strictEqual(currentYear, '2025', 'Current year should be 2025');
  
  // Filter terms by year
  const termsInYear = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  assert.deepStrictEqual(
    termsInYear, 
    ['2025-0', '2025-1', '2025-2'],
    'Should filter to 2025-* terms only'
  );
  
  console.log('   ✅ Year mode correctly handles intersession as current term\n');
}

// Test 4: Compare with 'future' mode behavior
console.log('Test 4: Compare year mode vs future mode');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false }
  ];
  
  const currentTerm = '2025-1';
  const currentYear = getTermYear(currentTerm);
  
  // Year mode: all terms in same year
  const yearModeTerms = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  // Future mode: only terms after current
  const futureModeTerms = availableTerms
    .filter(t => compareTermCodes(t.value, currentTerm) > 0)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  // Year mode should include 2025-0 (intersession before current semester)
  assert.ok(yearModeTerms.includes('2025-0'), 'Year mode should include 2025-0');
  
  // Future mode should NOT include 2025-0 (it's before 2025-1)
  assert.ok(!futureModeTerms.includes('2025-0'), 'Future mode should NOT include 2025-0');
  
  // Both should include 2025-2
  assert.ok(yearModeTerms.includes('2025-2'), 'Year mode should include 2025-2');
  assert.ok(futureModeTerms.includes('2025-2'), 'Future mode should include 2025-2');
  
  // Future mode includes 2026-0, year mode does not
  assert.ok(!yearModeTerms.includes('2026-0'), 'Year mode should NOT include 2026-0');
  assert.ok(futureModeTerms.includes('2026-0'), 'Future mode should include 2026-0');
  
  console.log('   Year mode terms:', yearModeTerms);
  console.log('   Future mode terms:', futureModeTerms);
  console.log('   ✅ Year mode correctly captures all terms in academic year\n');
}

// Test 5: Edge case - only one term in year
console.log('Test 5: Edge case - only one term available in current year');
{
  const availableTerms = [
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true }
  ];
  
  const currentTerm = '2025-1';
  const currentYear = getTermYear(currentTerm);
  
  const termsInYear = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  assert.deepStrictEqual(termsInYear, ['2025-1'], 'Should only include 2025-1');
  
  console.log('   ✅ Handles single term in year correctly\n');
}

// Test 6: Edge case - multiple years with all semesters
console.log('Test 6: Multiple years with complete semester sets');
{
  const availableTerms = [
    { value: '2024-0', label: '2024-2025-Intersession', selected: false },
    { value: '2024-1', label: '2024-2025-First Semester', selected: false },
    { value: '2024-2', label: '2024-2025-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true },
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2026-0', label: '2026-2027-Intersession', selected: false },
    { value: '2026-1', label: '2026-2027-First Semester', selected: false }
  ];
  
  const currentTerm = '2025-1';
  const currentYear = getTermYear(currentTerm);
  
  const termsInYear = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  assert.deepStrictEqual(
    termsInYear, 
    ['2025-0', '2025-1', '2025-2'],
    'Should only include 2025-* terms'
  );
  
  // Verify exact count
  assert.strictEqual(termsInYear.length, 3, 'Should have exactly 3 terms');
  
  console.log('   ✅ Correctly filters to year 2025 only\n');
}

// Test 7: Sorting verification
console.log('Test 7: Verify terms are sorted correctly');
{
  const availableTerms = [
    { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
    { value: '2025-0', label: '2025-2026-Intersession', selected: false },
    { value: '2025-1', label: '2025-2026-First Semester', selected: true }
  ];
  
  const currentYear = '2025';
  
  // Terms might be in any order from AISIS
  const termsInYear = availableTerms
    .filter(t => getTermYear(t.value) === currentYear)
    .map(t => t.value)
    .sort(compareTermCodes);
  
  // Should be sorted: 0, 1, 2
  assert.deepStrictEqual(
    termsInYear, 
    ['2025-0', '2025-1', '2025-2'],
    'Terms should be sorted by semester number'
  );
  
  console.log('   ✅ Terms sorted correctly (0, 1, 2)\n');
}

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All term year mode tests passed!');
console.log('═══════════════════════════════════════════════════════');
