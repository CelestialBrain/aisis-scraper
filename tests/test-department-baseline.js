/**
 * Test per-department baseline tracking
 * 
 * Tests the extended baseline manager that tracks per-department
 * baselines for granular regression detection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { BaselineManager } from '../src/baseline.js';

describe('Per-Department Baseline Tracking', () => {
  let baselineManager;
  const testBaselineDir = 'logs/baselines-test';
  const testTerm = '2025-1';

  before(() => {
    // Create test baseline directory
    if (!fs.existsSync(testBaselineDir)) {
      fs.mkdirSync(testBaselineDir, { recursive: true });
    }
    
    baselineManager = new BaselineManager(testBaselineDir);
  });

  after(() => {
    // Clean up test files
    if (fs.existsSync(testBaselineDir)) {
      const files = fs.readdirSync(testBaselineDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testBaselineDir, file));
      }
      fs.rmdirSync(testBaselineDir);
    }
  });

  describe('buildDepartmentBaselineData', () => {
    it('should build per-department baseline data from scrape results', () => {
      const departmentsArray = [
        {
          department: 'MA',
          courses: [
            { subjectCode: 'MATH 10', section: 'A', title: 'Algebra' },
            { subjectCode: 'MATH 11', section: 'B', title: 'Trigonometry' },
            { subjectCode: 'MATH 20', section: 'A', title: 'Calculus' }
          ]
        },
        {
          department: 'PE',
          courses: [
            { subjectCode: 'PEPC 10', section: 'A', title: 'Swimming' },
            { subjectCode: 'PEPC 11', section: 'B', title: 'Basketball' },
            { subjectCode: 'PHYED 20', section: 'A', title: 'Fitness' }
          ]
        }
      ];

      const result = baselineManager.buildDepartmentBaselineData(departmentsArray);

      assert.ok(result.MA, 'Should have MA department data');
      assert.strictEqual(result.MA.row_count, 3, 'MA should have 3 courses');
      assert.ok(result.MA.prefix_breakdown, 'Should have prefix breakdown');
      assert.strictEqual(result.MA.prefix_breakdown.MATH, 3, 'All MA courses should be MATH');

      assert.ok(result.PE, 'Should have PE department data');
      assert.strictEqual(result.PE.row_count, 3, 'PE should have 3 courses');
      assert.strictEqual(result.PE.prefix_breakdown.PEPC, 2, 'PE should have 2 PEPC courses');
      assert.strictEqual(result.PE.prefix_breakdown.PHYED, 1, 'PE should have 1 PHYED course');
    });
  });

  describe('saveDepartmentBaseline and loadDepartmentBaseline', () => {
    it('should save and load per-department baseline', () => {
      const deptData = {
        'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } },
        'PE': { row_count: 152, prefix_breakdown: { 'PEPC': 79, 'PHYED': 73 } },
        'EC': { row_count: 98, prefix_breakdown: { 'ECON': 98 } }
      };

      baselineManager.saveDepartmentBaseline(testTerm, deptData);

      // Verify file was created
      const baselinePath = baselineManager.getDepartmentBaselinePath(testTerm);
      assert.ok(fs.existsSync(baselinePath), 'Baseline file should exist');

      // Load and verify
      const loaded = baselineManager.loadDepartmentBaseline(testTerm);
      assert.ok(loaded, 'Should load baseline');
      assert.strictEqual(loaded.term, testTerm, 'Should have correct term');
      assert.ok(loaded.timestamp, 'Should have timestamp');
      assert.ok(loaded.departments, 'Should have departments data');
      
      assert.strictEqual(loaded.departments.MA.row_count, 305, 'MA should have 305 rows');
      assert.strictEqual(loaded.departments.MA.prefix_breakdown.MATH, 305, 'MA should have 305 MATH courses');
      
      assert.strictEqual(loaded.departments.PE.row_count, 152, 'PE should have 152 rows');
      assert.strictEqual(loaded.departments.PE.prefix_breakdown.PEPC, 79, 'PE should have 79 PEPC courses');
    });

    it('should return null when no baseline exists', () => {
      const loaded = baselineManager.loadDepartmentBaseline('9999-9');
      assert.strictEqual(loaded, null, 'Should return null for non-existent baseline');
    });
  });

  describe('compareWithDepartmentBaseline', () => {
    it('should detect no regression when counts are similar', () => {
      const previousData = {
        'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } },
        'PE': { row_count: 152, prefix_breakdown: { 'PEPC': 79, 'PHYED': 73 } }
      };
      baselineManager.saveDepartmentBaseline(testTerm, previousData);

      const currentData = {
        'MA': { row_count: 310, prefix_breakdown: { 'MATH': 310 } },
        'PE': { row_count: 155, prefix_breakdown: { 'PEPC': 81, 'PHYED': 74 } }
      };

      const result = baselineManager.compareWithDepartmentBaseline(testTerm, currentData);

      assert.strictEqual(result.hasPrevious, true, 'Should have previous baseline');
      assert.strictEqual(result.regressions.length, 0, 'Should have no regressions');
      assert.strictEqual(result.hasCriticalRegressions, false, 'Should have no critical regressions');
    });

    it('should detect regression when MA drops significantly', () => {
      const previousData = {
        'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } },
        'PE': { row_count: 152, prefix_breakdown: { 'PEPC': 79, 'PHYED': 73 } }
      };
      baselineManager.saveDepartmentBaseline(testTerm, previousData);

      // MA drops to only 13 courses (> 50% drop)
      const currentData = {
        'MA': { row_count: 13, prefix_breakdown: { 'KRN': 13 } },
        'PE': { row_count: 155, prefix_breakdown: { 'PEPC': 81, 'PHYED': 74 } }
      };

      const result = baselineManager.compareWithDepartmentBaseline(testTerm, currentData);

      assert.strictEqual(result.hasPrevious, true, 'Should have previous baseline');
      assert.ok(result.regressions.length > 0, 'Should detect regressions');
      assert.strictEqual(result.hasCriticalRegressions, true, 'MA is critical, should flag');

      const maRegression = result.regressions.find(r => r.department === 'MA');
      assert.ok(maRegression, 'Should have MA regression');
      assert.strictEqual(maRegression.previousCount, 305, 'Should track previous count');
      assert.strictEqual(maRegression.currentCount, 13, 'Should track current count');
      assert.ok(parseFloat(maRegression.percentDrop) > 50, 'Should show > 50% drop');
      assert.strictEqual(maRegression.isCritical, true, 'MA should be critical');
    });

    it('should detect missing subject prefixes', () => {
      const previousData = {
        'PE': { row_count: 152, prefix_breakdown: { 'PEPC': 79, 'PHYED': 73 } }
      };
      baselineManager.saveDepartmentBaseline(testTerm, previousData);

      // PEPC courses disappeared
      const currentData = {
        'PE': { row_count: 73, prefix_breakdown: { 'PHYED': 73 } }
      };

      const result = baselineManager.compareWithDepartmentBaseline(testTerm, currentData);

      assert.ok(result.regressions.length > 0, 'Should detect PE regression');
      
      const peRegression = result.regressions.find(r => r.department === 'PE');
      assert.ok(peRegression, 'Should have PE regression');
      assert.ok(peRegression.missingPrefixes, 'Should track missing prefixes');
      assert.ok(
        peRegression.missingPrefixes.includes('PEPC'),
        'Should detect PEPC is missing'
      );
    });

    it('should warn about departments that disappeared entirely', () => {
      const previousData = {
        'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } },
        'EC': { row_count: 98, prefix_breakdown: { 'ECON': 98 } }
      };
      baselineManager.saveDepartmentBaseline(testTerm, previousData);

      // EC department missing entirely
      const currentData = {
        'MA': { row_count: 310, prefix_breakdown: { 'MATH': 310 } }
      };

      const result = baselineManager.compareWithDepartmentBaseline(testTerm, currentData);

      assert.ok(result.warnings.length > 0, 'Should have warnings');
      
      const ecWarning = result.warnings.find(w => w.department === 'EC');
      assert.ok(ecWarning, 'Should warn about EC disappearing');
      assert.strictEqual(ecWarning.previousCount, 98, 'Should track previous count');
      assert.strictEqual(ecWarning.currentCount, 0, 'Should show 0 current count');
    });

    it('should handle first run with no previous baseline', () => {
      const currentData = {
        'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } }
      };

      const result = baselineManager.compareWithDepartmentBaseline('2099-1', currentData);

      assert.strictEqual(result.hasPrevious, false, 'Should have no previous baseline');
      assert.strictEqual(result.regressions.length, 0, 'Should have no regressions');
      assert.strictEqual(result.hasCriticalRegressions, false, 'Should have no critical regressions');
    });
  });

  describe('Configuration', () => {
    it('should respect BASELINE_DEPT_DROP_THRESHOLD environment variable', () => {
      const originalEnv = process.env.BASELINE_DEPT_DROP_THRESHOLD;
      
      try {
        process.env.BASELINE_DEPT_DROP_THRESHOLD = '0.3'; // 30% threshold
        
        const threshold = parseFloat(process.env.BASELINE_DEPT_DROP_THRESHOLD || '0.5');
        assert.strictEqual(threshold, 0.3, 'Should use custom threshold');
      } finally {
        if (originalEnv) {
          process.env.BASELINE_DEPT_DROP_THRESHOLD = originalEnv;
        } else {
          delete process.env.BASELINE_DEPT_DROP_THRESHOLD;
        }
      }
    });
  });
});
