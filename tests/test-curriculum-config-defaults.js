/**
 * Test Curriculum Scraping Configuration Defaults
 * 
 * Verifies that the default configuration values for curriculum scraping
 * match the production-tested optimal settings:
 * - Default delay: 500ms (balanced mode)
 * - Default concurrency: 4
 * - Max retry attempts: 3
 * 
 * These values were determined through production testing which showed:
 * - Before (concurrency=6, delay=300ms): 92.5% success rate, 24 session bleed failures
 * - After (concurrency=4, delay=500ms): 97.4% success rate, only 1 session bleed failure
 */

import fs from 'fs';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Curriculum Scraping Configuration Defaults');
console.log('═══════════════════════════════════════════════════════\n');

// Read the scraper.js file
const scraperContent = fs.readFileSync('src/scraper.js', 'utf8');

let passedTests = 0;
let totalTests = 0;

// Test 1: Verify default curriculum delay is 500ms for balanced mode
totalTests++;
console.log('Test 1: Default curriculum delay should be 500ms (balanced mode)');
const delayMatch = scraperContent.match(/const defaultCurriculumDelay = fastMode \? (\d+) : (\d+);/);
if (delayMatch) {
  const fastModeDelay = parseInt(delayMatch[1], 10);
  const normalModeDelay = parseInt(delayMatch[2], 10);
  if (normalModeDelay === 500) {
    console.log(`   ✅ PASS: Default delay is 500ms (fast mode: ${fastModeDelay}ms)\n`);
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Expected 500ms, got ${normalModeDelay}ms\n`);
  }
} else {
  console.log('   ❌ FAIL: Could not find defaultCurriculumDelay definition\n');
}

// Test 2: Verify default curriculum concurrency is 4
totalTests++;
console.log('Test 2: Default curriculum concurrency should be 4');
const concurrencyMatch = scraperContent.match(/const defaultCurriculumConcurrency = (\d+);/);
if (concurrencyMatch) {
  const defaultConcurrency = parseInt(concurrencyMatch[1], 10);
  if (defaultConcurrency === 4) {
    console.log('   ✅ PASS: Default concurrency is 4\n');
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Expected 4, got ${defaultConcurrency}\n`);
  }
} else {
  console.log('   ❌ FAIL: Could not find defaultCurriculumConcurrency definition\n');
}

// Test 3: Verify max retry attempts is 3
totalTests++;
console.log('Test 3: Max retry attempts should be 3 in _scrapeDegreeWithValidation');
const maxAttemptsMatch = scraperContent.match(/async _scrapeDegreeWithValidation\(degCode, label, maxAttempts = (\d+)\)/);
if (maxAttemptsMatch) {
  const maxAttempts = parseInt(maxAttemptsMatch[1], 10);
  if (maxAttempts === 3) {
    console.log('   ✅ PASS: Max attempts is 3\n');
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Expected 3, got ${maxAttempts}\n`);
  }
} else {
  console.log('   ❌ FAIL: Could not find _scrapeDegreeWithValidation method signature\n');
}

// Test 4: Verify fast mode delay is still 500ms (should not change)
totalTests++;
console.log('Test 4: Fast mode delay should remain 500ms');
if (delayMatch) {
  const fastModeDelay = parseInt(delayMatch[1], 10);
  if (fastModeDelay === 500) {
    console.log('   ✅ PASS: Fast mode delay is 500ms\n');
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Expected 500ms, got ${fastModeDelay}ms\n`);
  }
} else {
  console.log('   ❌ FAIL: Could not verify fast mode delay\n');
}

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('📊 Test Results:');
console.log(`   Total: ${totalTests}`);
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${totalTests - passedTests}`);
console.log('═══════════════════════════════════════════════════════\n');

if (passedTests === totalTests) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
