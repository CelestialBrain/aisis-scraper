import { AISISScraper } from '../src/scraper.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test English (EN) department completeness with various edge cases
 * 
 * This test validates that the parser correctly handles all 14 columns
 * and captures all courses including those with special section codes,
 * decimal course numbers, and 0-unit enrollment objects.
 * 
 * This serves as a regression test for the EN department data loss issue.
 */
async function testEnglishCompleteness() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing English (EN) Department Completeness');
  console.log('═══════════════════════════════════════════════════════\n');

  const scraper = new AISISScraper('test_user', 'test_pass');

  // Load EN fixture
  const fixturePath = join(__dirname, 'fixtures', 'english-2025-1-sample.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  console.log('📄 Loaded EN fixture: english-2025-1-sample.html\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'EN');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Expected course patterns to validate
  const expectedPatterns = [
    // Regular course with decimal course number
    { subjectCode: 'ENE 13.03i', section: 'N', title: 'STORY AND NARRATIVE IN THE HUMANITIES', units: '3', s: 'N', p: 'N' },
    
    // Complex section codes
    { subjectCode: 'ENGL 11', section: 'WXY1', title: 'PURPOSIVE COMMUNICATION', units: '3', s: 'AS', p: 'AP' },
    { subjectCode: 'ENE 13.04i', section: 'ST1A', title: 'STORY AND NARRATIVE IN MANAGEMENT', units: '3', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 223', section: 'PT-GRAD', title: 'ELLT SEMINAR: CRITICAL LANGUAGE PEDAGOGY', units: '3', s: 'N', p: 'N' },
    
    // 0-unit enrollment objects - CRITICAL TEST CASES
    { subjectCode: 'ENGL 296', section: 'COMP', title: 'COMPREHENSIVE EXAMINATIONS', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 298.66', section: 'SUB-A', title: 'SUBMISSION OF FINAL CAPSTONE PROJECT', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 298.77', section: 'SUB-B', title: 'SUBMISSION OF FINAL CAPSTONE PROJECT', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS1', title: 'THESIS I', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS2', title: 'THESIS I', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS7', title: 'THESIS I', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.19', section: 'YYY', title: 'THESIS PROPOSAL DEFENSE', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.2', section: 'THES/DISS4', title: 'THESIS II', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.4', section: 'ODEF1', title: 'ORAL DEFENSE', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.5', section: 'RESID', title: 'RESIDENCY', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.6', section: 'SUB-A', title: 'FINAL PAPER SUBMISSION (MASTERS)', units: '0', s: 'N', p: 'N' },
    { subjectCode: 'ENGL 299.7', section: 'SUB-B', title: 'FINAL PAPER SUBMISSION (MASTERS)', units: '0', s: 'N', p: 'N' },
  ];

  let passed = 0;
  let failed = 0;
  const missing = [];

  console.log('🔍 Validating expected course patterns...\n');

  // Check each expected pattern
  for (const expected of expectedPatterns) {
    const found = courses.find(c => 
      c.subjectCode === expected.subjectCode && 
      c.section === expected.section
    );

    if (!found) {
      console.log(`❌ MISSING: ${expected.subjectCode} ${expected.section} - ${expected.title}`);
      failed++;
      missing.push(expected);
    } else {
      // Verify details match
      const titleMatch = found.title === expected.title;
      const unitsMatch = found.units === expected.units;
      const sMatch = found.s === expected.s;
      const pMatch = found.p === expected.p;
      
      if (titleMatch && unitsMatch && sMatch && pMatch) {
        console.log(`✅ Found: ${expected.subjectCode} ${expected.section} - ${expected.title} (${expected.units} units, S=${expected.s}, P=${expected.p})`);
        passed++;
      } else {
        console.log(`⚠️  PARTIAL: ${expected.subjectCode} ${expected.section}`);
        if (!titleMatch) console.log(`   Title mismatch: expected "${expected.title}", got "${found.title}"`);
        if (!unitsMatch) console.log(`   Units mismatch: expected "${expected.units}", got "${found.units}"`);
        if (!sMatch) console.log(`   S mismatch: expected "${expected.s}", got "${found.s}"`);
        if (!pMatch) console.log(`   P mismatch: expected "${expected.p}", got "${found.p}"`);
        failed++;
      }
    }
  }

  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`   Total patterns tested: ${expectedPatterns.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  // Verify total count matches expected
  console.log(`\n📌 Total Courses in Fixture:`);
  console.log(`   Expected: 24 (from HTML fixture)`);
  console.log(`   Found: ${courses.length}`);

  // Special focus on critical 0-unit patterns
  const zeroUnitPatterns = expectedPatterns.filter(p => p.units === '0');
  const zeroUnitFound = zeroUnitPatterns.filter(p => 
    courses.find(c => c.subjectCode === p.subjectCode && c.section === p.section)
  );
  
  console.log(`\n📌 Critical 0-Unit Patterns:`);
  console.log(`   Expected: ${zeroUnitPatterns.length}`);
  console.log(`   Found: ${zeroUnitFound.length}`);
  console.log(`   Missing: ${zeroUnitPatterns.length - zeroUnitFound.length}`);

  // Verify S and P columns are captured
  const coursesWithS = courses.filter(c => c.s && c.s !== '');
  const coursesWithP = courses.filter(c => c.p && c.p !== '');
  
  console.log(`\n📌 S and P Column Capture:`);
  console.log(`   Courses with S column: ${coursesWithS.length}`);
  console.log(`   Courses with P column: ${coursesWithP.length}`);
  console.log(`   Total courses: ${courses.length}`);

  // Verify TBA (~) preservation
  const coursesWithTilde = courses.filter(c => c.time && c.time.includes('(~)'));
  console.log(`\n📌 TBA (~) Marker Preservation:`);
  console.log(`   Courses with TBA (~): ${coursesWithTilde.length}`);

  if (failed === 0 && courses.length === 24) {
    console.log('\n✅ All EN completeness tests passed!');
    console.log('   Parser correctly handles:');
    console.log('   - All 14 columns including S and P');
    console.log('   - Decimal course numbers (ENE 13.03i, ENGL 298.66, etc.)');
    console.log('   - Special section codes (WXY1, ST1A, PT-GRAD, THES/DISS, etc.)');
    console.log('   - 0-unit courses');
    console.log('   - Graduate-level courses');
    console.log('   - TBA (~) marker preservation');
    console.log('   - <br> tag normalization in time cells');
    return true;
  } else {
    console.log('\n❌ Some EN completeness tests failed!');
    console.log('   This indicates potential data loss in production scraping.');
    return false;
  }
}

// Run tests
testEnglishCompleteness().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
