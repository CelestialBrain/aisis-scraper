/**
 * Test baseline requirement validation
 * 
 * This test verifies that when REQUIRE_BASELINES=true, the baseline manager
 * correctly fails fast if no baseline files exist. This prevents data loss
 * from accidental ingestion when baselines are missing.
 */

import fs from 'fs';
import path from 'path';
import { BaselineManager } from '../src/baseline.js';

console.log('🧪 Test: Baseline Requirement Validation\n');
console.log('═══════════════════════════════════════════════════════\n');

// Create a temporary directory for testing
const TEST_BASELINE_DIR = '/tmp/test-baselines-' + Date.now();

let passed = 0;
let failed = 0;

// Helper to clean up test directory
function cleanup() {
  if (fs.existsSync(TEST_BASELINE_DIR)) {
    fs.rmSync(TEST_BASELINE_DIR, { recursive: true });
  }
}

// Test 1: validateBaselinesExist throws when REQUIRE_BASELINES=true and no baselines
console.log('Test 1: Should throw when REQUIRE_BASELINES=true and no baselines exist');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'true';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  try {
    manager.validateBaselinesExist();
    console.log('❌ FAIL: Should have thrown an error');
    failed++;
  } catch (e) {
    if (e.message.includes('Baselines artifact')) {
      console.log('✅ PASS: Correctly threw error when baselines missing');
      passed++;
    } else {
      console.log('❌ FAIL: Wrong error message:', e.message);
      failed++;
    }
  }
} finally {
  cleanup();
}

// Test 2: validateBaselinesExist does not throw when REQUIRE_BASELINES=false
console.log('\nTest 2: Should not throw when REQUIRE_BASELINES=false');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'false';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  try {
    manager.validateBaselinesExist();
    console.log('✅ PASS: No error thrown when REQUIRE_BASELINES=false');
    passed++;
  } catch (e) {
    console.log('❌ FAIL: Should not have thrown:', e.message);
    failed++;
  }
} finally {
  cleanup();
}

// Test 3: validateBaselinesExist passes when baselines exist
console.log('\nTest 3: Should not throw when baselines exist');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'true';
  
  // Create the directory and a baseline file
  fs.mkdirSync(TEST_BASELINE_DIR, { recursive: true });
  const baselineData = {
    term: '2025-1',
    timestamp: new Date().toISOString(),
    totalRecords: 3886,
    departmentCounts: { INTAC: 104, DISCS: 500 }
  };
  fs.writeFileSync(
    path.join(TEST_BASELINE_DIR, 'baseline-2025-1.json'),
    JSON.stringify(baselineData, null, 2)
  );
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  try {
    manager.validateBaselinesExist();
    console.log('✅ PASS: No error thrown when baselines exist');
    passed++;
  } catch (e) {
    console.log('❌ FAIL: Should not have thrown:', e.message);
    failed++;
  }
} finally {
  cleanup();
}

// Test 4: hasAnyBaselines returns false when no baselines
console.log('\nTest 4: hasAnyBaselines should return false when empty');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'false';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  const result = manager.hasAnyBaselines();
  if (result === false) {
    console.log('✅ PASS: hasAnyBaselines returns false for empty dir');
    passed++;
  } else {
    console.log('❌ FAIL: hasAnyBaselines should return false, got:', result);
    failed++;
  }
} finally {
  cleanup();
}

// Test 5: hasAnyBaselines returns true when baselines exist
console.log('\nTest 5: hasAnyBaselines should return true when baselines exist');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'false';
  
  // Create the directory and a baseline file
  fs.mkdirSync(TEST_BASELINE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_BASELINE_DIR, 'baseline-2025-1.json'),
    JSON.stringify({ term: '2025-1', totalRecords: 100 })
  );
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  const result = manager.hasAnyBaselines();
  if (result === true) {
    console.log('✅ PASS: hasAnyBaselines returns true when baselines exist');
    passed++;
  } else {
    console.log('❌ FAIL: hasAnyBaselines should return true, got:', result);
    failed++;
  }
} finally {
  cleanup();
}

// Test 6: getConfigSummary includes requireBaselines
console.log('\nTest 6: getConfigSummary should include requireBaselines');
try {
  cleanup();
  process.env.REQUIRE_BASELINES = 'true';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  const config = manager.getConfigSummary();
  
  if (config.requireBaselines === true) {
    console.log('✅ PASS: getConfigSummary includes requireBaselines=true');
    passed++;
  } else {
    console.log('❌ FAIL: getConfigSummary.requireBaselines should be true, got:', config.requireBaselines);
    failed++;
  }
} finally {
  cleanup();
  // Reset env var
  delete process.env.REQUIRE_BASELINES;
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
