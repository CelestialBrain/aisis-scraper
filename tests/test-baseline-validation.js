/**
 * Test baseline requirement validation
 * 
 * This test verifies that the baseline manager correctly handles various
 * combinations of REQUIRE_BASELINES and BASELINE_WARN_ONLY settings:
 * 
 * - When REQUIRE_BASELINES=true and BASELINE_WARN_ONLY=false (strict mode):
 *   Throw error if no baselines exist
 * - When REQUIRE_BASELINES=true and BASELINE_WARN_ONLY=true (warn-only/bootstrap mode):
 *   Warn but continue if no baselines exist
 * - When REQUIRE_BASELINES=false:
 *   Skip validation entirely
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

// Helper to clean up test directory and reset environment
function cleanup() {
  if (fs.existsSync(TEST_BASELINE_DIR)) {
    fs.rmSync(TEST_BASELINE_DIR, { recursive: true });
  }
}

function resetEnv() {
  delete process.env.REQUIRE_BASELINES;
  delete process.env.BASELINE_WARN_ONLY;
}

// Test 1: validateBaselinesExist throws when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=false, and no baselines
console.log('Test 1: Should throw when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=false, and no baselines exist (strict mode)');
try {
  cleanup();
  resetEnv();
  process.env.REQUIRE_BASELINES = 'true';
  process.env.BASELINE_WARN_ONLY = 'false';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  try {
    manager.validateBaselinesExist();
    console.log('❌ FAIL: Should have thrown an error');
    failed++;
  } catch (e) {
    if (e.message.includes('Baselines artifact')) {
      console.log('✅ PASS: Correctly threw error when baselines missing in strict mode');
      passed++;
    } else {
      console.log('❌ FAIL: Wrong error message:', e.message);
      failed++;
    }
  }
} finally {
  cleanup();
  resetEnv();
}

// Test 2: validateBaselinesExist does not throw when REQUIRE_BASELINES=false
console.log('\nTest 2: Should not throw when REQUIRE_BASELINES=false');
try {
  cleanup();
  resetEnv();
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
  resetEnv();
}

// Test 3: validateBaselinesExist passes when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=true, and baselines exist
console.log('\nTest 3: Should not throw when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=true, and baselines exist');
try {
  cleanup();
  resetEnv();
  process.env.REQUIRE_BASELINES = 'true';
  process.env.BASELINE_WARN_ONLY = 'true';
  
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
  resetEnv();
}

// Test 4: validateBaselinesExist does not throw when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=true (default), and no baselines (warn-only/bootstrap mode)
console.log('\nTest 4: Should not throw when REQUIRE_BASELINES=true, BASELINE_WARN_ONLY=true, and no baselines exist (warn-only bootstrap mode)');
try {
  cleanup();
  resetEnv();
  process.env.REQUIRE_BASELINES = 'true';
  process.env.BASELINE_WARN_ONLY = 'true';
  
  const manager = new BaselineManager(TEST_BASELINE_DIR);
  
  try {
    manager.validateBaselinesExist();
    console.log('✅ PASS: No error thrown in warn-only bootstrap mode (warning emitted instead)');
    passed++;
  } catch (e) {
    console.log('❌ FAIL: Should not have thrown in warn-only mode:', e.message);
    failed++;
  }
} finally {
  cleanup();
  resetEnv();
}

// Test 5: hasAnyBaselines returns false when no baselines
console.log('\nTest 5: hasAnyBaselines should return false when empty');
try {
  cleanup();
  resetEnv();
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
  resetEnv();
}

// Test 6: hasAnyBaselines returns true when baselines exist
console.log('\nTest 6: hasAnyBaselines should return true when baselines exist');
try {
  cleanup();
  resetEnv();
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
  resetEnv();
}

// Test 7: getConfigSummary includes requireBaselines
console.log('\nTest 7: getConfigSummary should include requireBaselines');
try {
  cleanup();
  resetEnv();
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
  resetEnv();
}

// Summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Results:');
console.log(`   Total: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════');

// Final cleanup
resetEnv();

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed!`);
  process.exit(1);
}
