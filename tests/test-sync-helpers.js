/**
 * Test the sync helper functions (chunkArray and processWithConcurrency)
 */

import { chunkArray, processWithConcurrency } from '../src/supabase.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Sync Helper Functions');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

// Test 1: chunkArray with even division
console.log('Test 1: chunkArray with even division');
const items1 = [1, 2, 3, 4, 5, 6];
const chunks1 = chunkArray(items1, 2);
const expected1 = [[1, 2], [3, 4], [5, 6]];
if (JSON.stringify(chunks1) === JSON.stringify(expected1)) {
  console.log('✅ PASS: Even division works correctly');
  passed++;
} else {
  console.log('❌ FAIL: Even division failed');
  console.log('   Expected:', expected1);
  console.log('   Got:', chunks1);
  failed++;
}

// Test 2: chunkArray with remainder
console.log('\nTest 2: chunkArray with remainder');
const items2 = [1, 2, 3, 4, 5];
const chunks2 = chunkArray(items2, 2);
const expected2 = [[1, 2], [3, 4], [5]];
if (JSON.stringify(chunks2) === JSON.stringify(expected2)) {
  console.log('✅ PASS: Remainder handling works correctly');
  passed++;
} else {
  console.log('❌ FAIL: Remainder handling failed');
  console.log('   Expected:', expected2);
  console.log('   Got:', chunks2);
  failed++;
}

// Test 3: chunkArray with single chunk
console.log('\nTest 3: chunkArray with single chunk');
const items3 = [1, 2];
const chunks3 = chunkArray(items3, 5);
const expected3 = [[1, 2]];
if (JSON.stringify(chunks3) === JSON.stringify(expected3)) {
  console.log('✅ PASS: Single chunk works correctly');
  passed++;
} else {
  console.log('❌ FAIL: Single chunk failed');
  console.log('   Expected:', expected3);
  console.log('   Got:', chunks3);
  failed++;
}

// Test 4: chunkArray with empty array
console.log('\nTest 4: chunkArray with empty array');
const items4 = [];
const chunks4 = chunkArray(items4, 2);
const expected4 = [];
if (JSON.stringify(chunks4) === JSON.stringify(expected4)) {
  console.log('✅ PASS: Empty array works correctly');
  passed++;
} else {
  console.log('❌ FAIL: Empty array failed');
  console.log('   Expected:', expected4);
  console.log('   Got:', chunks4);
  failed++;
}

// Test 5: chunkArray validation - invalid array
console.log('\nTest 5: chunkArray validation - invalid array');
try {
  chunkArray('not an array', 2);
  console.log('❌ FAIL: Should throw TypeError for non-array');
  failed++;
} catch (e) {
  if (e instanceof TypeError) {
    console.log('✅ PASS: Correctly throws TypeError for non-array');
    passed++;
  } else {
    console.log('❌ FAIL: Wrong error type:', e.constructor.name);
    failed++;
  }
}

// Test 6: chunkArray validation - invalid size
console.log('\nTest 6: chunkArray validation - invalid size');
try {
  chunkArray([1, 2, 3], 0);
  console.log('❌ FAIL: Should throw RangeError for size <= 0');
  failed++;
} catch (e) {
  if (e instanceof RangeError) {
    console.log('✅ PASS: Correctly throws RangeError for size <= 0');
    passed++;
  } else {
    console.log('❌ FAIL: Wrong error type:', e.constructor.name);
    failed++;
  }
}

// Test 7: processWithConcurrency basic functionality
console.log('\nTest 7: processWithConcurrency basic functionality');
const items7 = [1, 2, 3, 4, 5];
const processOrder = [];
const results7 = await processWithConcurrency(items7, 2, async (item) => {
  processOrder.push(item);
  await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
  return item * 2;
});
const expected7 = [2, 4, 6, 8, 10];
if (JSON.stringify(results7) === JSON.stringify(expected7)) {
  console.log('✅ PASS: processWithConcurrency returns correct results');
  passed++;
} else {
  console.log('❌ FAIL: processWithConcurrency results incorrect');
  console.log('   Expected:', expected7);
  console.log('   Got:', results7);
  failed++;
}

// Test 8: processWithConcurrency respects concurrency limit
console.log('\nTest 8: processWithConcurrency respects concurrency limit');
let maxConcurrent = 0;
let currentConcurrent = 0;
const items8 = [1, 2, 3, 4, 5, 6, 7, 8];
await processWithConcurrency(items8, 3, async (item) => {
  currentConcurrent++;
  if (currentConcurrent > maxConcurrent) {
    maxConcurrent = currentConcurrent;
  }
  await new Promise(resolve => setTimeout(resolve, 20));
  currentConcurrent--;
  return item;
});
if (maxConcurrent <= 3) {
  console.log(`✅ PASS: Concurrency limit respected (max concurrent: ${maxConcurrent})`);
  passed++;
} else {
  console.log(`❌ FAIL: Concurrency limit violated (max concurrent: ${maxConcurrent}, limit: 3)`);
  failed++;
}

// Test 9: processWithConcurrency validation - invalid array
console.log('\nTest 9: processWithConcurrency validation - invalid array');
try {
  await processWithConcurrency('not an array', 2, async () => {});
  console.log('❌ FAIL: Should throw TypeError for non-array');
  failed++;
} catch (e) {
  if (e instanceof TypeError) {
    console.log('✅ PASS: Correctly throws TypeError for non-array');
    passed++;
  } else {
    console.log('❌ FAIL: Wrong error type:', e.constructor.name);
    failed++;
  }
}

// Test 10: processWithConcurrency validation - invalid concurrency
console.log('\nTest 10: processWithConcurrency validation - invalid concurrency');
try {
  await processWithConcurrency([1, 2, 3], 0, async () => {});
  console.log('❌ FAIL: Should throw RangeError for concurrency <= 0');
  failed++;
} catch (e) {
  if (e instanceof RangeError) {
    console.log('✅ PASS: Correctly throws RangeError for concurrency <= 0');
    passed++;
  } else {
    console.log('❌ FAIL: Wrong error type:', e.constructor.name);
    failed++;
  }
}

// Test 11: processWithConcurrency validation - invalid function
console.log('\nTest 11: processWithConcurrency validation - invalid function');
try {
  await processWithConcurrency([1, 2, 3], 2, 'not a function');
  console.log('❌ FAIL: Should throw TypeError for non-function');
  failed++;
} catch (e) {
  if (e instanceof TypeError) {
    console.log('✅ PASS: Correctly throws TypeError for non-function');
    passed++;
  } else {
    console.log('❌ FAIL: Wrong error type:', e.constructor.name);
    failed++;
  }
}

// Summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Results:');
console.log(`   Total: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════');

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed!`);
  process.exit(1);
}
