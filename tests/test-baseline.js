import { BaselineManager } from '../src/baseline.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Test baseline manager functionality
 */
async function testBaselineManager() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Baseline Manager');
  console.log('═══════════════════════════════════════════════════════\n');

  // Use a test directory in system temp (cross-platform compatible)
  const testDir = path.join(os.tmpdir(), 'test-baselines');
  
  try {
    const manager = new BaselineManager(testDir);

    console.log('📋 Test 1: First run (no previous baseline)\n');
    
    const term = '2025-TEST';
    const deptCounts = { 'EC': 150, 'EN': 200, 'MA': 100 };
    
    // First comparison - should have no previous baseline
    const result1 = manager.compareWithBaseline(term, 450, deptCounts);
    
    if (!result1.hasPrevious && result1.currentTotal === 450) {
      console.log('✅ First run correctly detected no previous baseline\n');
    } else {
      console.log('❌ First run failed\n');
      return false;
    }

    // Record baseline
    manager.recordBaseline(term, 450, deptCounts);
    
    console.log('📋 Test 2: Second run with slight decrease (within threshold)\n');
    
    // Second comparison - 5% decrease (within 5% threshold by default)
    const result2 = manager.compareWithBaseline(term, 428, deptCounts);  // -22 = -4.89%
    
    if (result2.hasPrevious && !result2.isRegression) {
      console.log('✅ Slight decrease correctly within threshold\n');
    } else {
      console.log('❌ Slight decrease test failed\n');
      return false;
    }

    console.log('📋 Test 3: Third run with significant drop (exceeds threshold)\n');
    
    // Third comparison - 12% decrease (exceeds 5% threshold)
    const result3 = manager.compareWithBaseline(term, 400, deptCounts);  // -50 = -11.11%
    
    if (result3.hasPrevious && result3.isRegression) {
      console.log('✅ Significant drop correctly detected as regression\n');
    } else {
      console.log('❌ Significant drop test failed\n');
      return false;
    }

    console.log('📋 Test 4: Warn-only mode check\n');
    
    if (!manager.shouldFailJob(result3)) {
      console.log('✅ Warn-only mode correctly prevents job failure\n');
    } else {
      console.log('❌ Warn-only mode test failed\n');
      return false;
    }

    console.log('📋 Test 5: Fail mode check\n');
    
    // Test with fail mode
    process.env.BASELINE_WARN_ONLY = 'false';
    const manager2 = new BaselineManager(testDir);
    const result4 = manager2.compareWithBaseline(term, 400, deptCounts);
    
    if (manager2.shouldFailJob(result4)) {
      console.log('✅ Fail mode correctly triggers job failure\n');
    } else {
      console.log('❌ Fail mode test failed\n');
      return false;
    }

    console.log('✅ All baseline manager tests passed!');
    return true;
  } finally {
    // Cleanup in finally block to ensure it runs even if tests fail
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    delete process.env.BASELINE_WARN_ONLY;
  }
}

// Run tests
testBaselineManager().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
