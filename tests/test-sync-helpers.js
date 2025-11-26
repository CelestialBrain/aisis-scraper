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

// Test 5: processWithConcurrency basic functionality
console.log('\nTest 5: processWithConcurrency basic functionality');
const items5 = [1, 2, 3, 4, 5];
const processOrder = [];
const results5 = await processWithConcurrency(items5, 2, async (item) => {
  processOrder.push(item);
  await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
  return item * 2;
});
const expected5 = [2, 4, 6, 8, 10];
if (JSON.stringify(results5) === JSON.stringify(expected5)) {
  console.log('✅ PASS: processWithConcurrency returns correct results');
  passed++;
} else {
  console.log('❌ FAIL: processWithConcurrency results incorrect');
  console.log('   Expected:', expected5);
  console.log('   Got:', results5);
  failed++;
}

// Test 6: processWithConcurrency respects concurrency limit
console.log('\nTest 6: processWithConcurrency respects concurrency limit');
let maxConcurrent = 0;
let currentConcurrent = 0;
const items6 = [1, 2, 3, 4, 5, 6, 7, 8];
await processWithConcurrency(items6, 3, async (item) => {
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
