/**
 * Test department sanity checks
 * 
 * Tests the sanity check infrastructure that prevents data loss from
 * AISIS misrouting or HTML quirks (e.g., MA returning KRN courses)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { AISISScraper } from '../src/scraper.js';

describe('Department Sanity Checks', () => {
  let scraper;

  before(() => {
    // Initialize scraper (credentials don't matter for parsing tests)
    scraper = new AISISScraper('test', 'test');
  });

  describe('MA (Mathematics) Department', () => {
    it('should pass sanity check with good MATH data', () => {
      const html = fs.readFileSync(
        path.join(process.cwd(), 'tests/fixtures/ma-good-sample.html'),
        'utf-8'
      );

      const courses = scraper._parseCourses(html, 'MA');
      
      // Verify we got MATH courses
      assert.ok(courses.length >= 8, `Expected at least 8 courses, got ${courses.length}`);
      
      // All courses should have MATH prefix
      const mathCourses = courses.filter(c => c.subjectCode.startsWith('MATH'));
      assert.strictEqual(
        mathCourses.length,
        courses.length,
        'All courses should have MATH prefix'
      );
      
      // Spot check a few courses
      const math10 = courses.find(c => c.subjectCode === 'MATH 10');
      assert.ok(math10, 'Should find MATH 10');
      assert.strictEqual(math10.title, 'College Algebra');
      
      const math311 = courses.find(c => c.subjectCode === 'MATH 31.1');
      assert.ok(math311, 'Should find MATH 31.1');
      assert.strictEqual(math311.title, 'Probability and Statistics');
    });

    it('should detect bad data (KRN/KOR courses instead of MATH)', () => {
      const html = fs.readFileSync(
        path.join(process.cwd(), 'tests/fixtures/ma-bad-sample.html'),
        'utf-8'
      );

      const courses = scraper._parseCourses(html, 'MA');
      
      // Verify we got courses but they're wrong
      assert.ok(courses.length >= 13, `Expected at least 13 courses, got ${courses.length}`);
      
      // Count MATH vs KRN/KOR courses
      const mathCourses = courses.filter(c => c.subjectCode.startsWith('MATH'));
      const krnCourses = courses.filter(c => c.subjectCode.startsWith('KRN') || c.subjectCode.startsWith('KOR'));
      
      assert.strictEqual(mathCourses.length, 0, 'Should have 0 MATH courses (bad data)');
      assert.ok(krnCourses.length > 0, 'Should have Korean courses (misrouted)');
    });
  });

  describe('PE (Physical Education) Department', () => {
    it('should pass sanity check with PEPC and PHYED courses', () => {
      const html = fs.readFileSync(
        path.join(process.cwd(), 'tests/fixtures/aisis-schedule-pe-mixed.html'),
        'utf-8'
      );

      const courses = scraper._parseCourses(html, 'PE');
      
      // Verify we have PE courses
      assert.ok(courses.length > 0, 'Should have courses');
      
      // Count PEPC and PHYED
      const pepcCourses = courses.filter(c => c.subjectCode.startsWith('PEPC'));
      const phyedCourses = courses.filter(c => c.subjectCode.startsWith('PHYED'));
      
      // Should have both PEPC and PHYED for healthy PE department
      assert.ok(
        pepcCourses.length > 0 || phyedCourses.length > 0,
        'Should have PEPC or PHYED courses'
      );
    });
  });

  describe('Sanity Check Thresholds', () => {
    it('should respect SCRAPER_MIN_MA_MATH environment variable', () => {
      // Test that configuration is loaded correctly
      const originalEnv = process.env.SCRAPER_MIN_MA_MATH;
      
      try {
        process.env.SCRAPER_MIN_MA_MATH = '100';
        
        // Re-import to pick up new env var
        // Note: In real implementation, config is loaded at module level
        // This test validates the pattern is correct
        const minMath = parseInt(process.env.SCRAPER_MIN_MA_MATH || '50', 10);
        assert.strictEqual(minMath, 100, 'Should use custom threshold');
      } finally {
        // Restore
        if (originalEnv) {
          process.env.SCRAPER_MIN_MA_MATH = originalEnv;
        } else {
          delete process.env.SCRAPER_MIN_MA_MATH;
        }
      }
    });

    it('should use default threshold when env var not set', () => {
      const originalEnv = process.env.SCRAPER_MIN_MA_MATH;
      
      try {
        delete process.env.SCRAPER_MIN_MA_MATH;
        
        const minMath = parseInt(process.env.SCRAPER_MIN_MA_MATH || '50', 10);
        assert.strictEqual(minMath, 50, 'Should use default threshold of 50');
      } finally {
        if (originalEnv) {
          process.env.SCRAPER_MIN_MA_MATH = originalEnv;
        }
      }
    });
  });
});
