import { AISISScraper } from '../src/scraper.js';
import { isHeaderLikeRecord, validateScheduleRecord, getSubjectPrefix } from '../src/constants.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test PE department subject parsing with mixed subject prefixes
 * 
 * This test validates:
 * 1. _parseCourses correctly extracts all PE course types (PEPC, NSTP, PHYED)
 * 2. Subject codes with dots (e.g., PEPC 13.03) are preserved
 * 3. No valid PE courses are filtered by isHeaderLikeRecord or validation
 * 4. Subject prefix counts accurately reflect parsed data
 */
async function testPESubjectParsing() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing PE Department Subject Parsing');
  console.log('═══════════════════════════════════════════════════════\n');

  // Create a scraper instance (no login needed for parsing tests)
  const scraper = new AISISScraper('test_user', 'test_pass');

  // Load PE mixed fixture HTML
  const fixturePath = join(__dirname, 'fixtures', 'aisis-schedule-pe-mixed.html');
  
  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ Fixture not found: ${fixturePath}`);
    process.exit(1);
  }
  
  const html = fs.readFileSync(fixturePath, 'utf-8');
  console.log('📄 Loaded test fixture: aisis-schedule-pe-mixed.html\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'PE');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Expected: 5 courses (1 header row should be filtered)
  // - PEPC 10
  // - PEPC 13.03
  // - NSTP 11/CWTS
  // - PHYED 100.20
  // - PEPC 15
  const expectedCourses = [
    { subjectCode: 'PEPC 10', section: 'A', title: 'RHYTHMIC ACTIVITIES' },
    { subjectCode: 'PEPC 13.03', section: 'B', title: 'BADMINTON' },
    { subjectCode: 'NSTP 11/CWTS', section: 'N-SPM2', title: 'CWTS 1' },
    { subjectCode: 'PHYED 100.20', section: 'C', title: 'FUNDAMENTALS OF BASKETBALL' },
    { subjectCode: 'PEPC 15', section: 'D', title: 'SWIMMING' }
  ];

  let passed = 0;
  let failed = 0;

  // Test 1: Correct number of courses parsed
  console.log('Test 1: Correct number of courses parsed');
  if (courses.length === expectedCourses.length) {
    console.log(`✅ PASS: ${courses.length} courses parsed (expected ${expectedCourses.length})`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${courses.length} courses parsed (expected ${expectedCourses.length})`);
    failed++;
  }
  console.log();

  // Test 2: All expected subject codes are present
  console.log('Test 2: All expected subject codes are present');
  const parsedSubjectCodes = courses.map(c => c.subjectCode);
  const expectedSubjectCodes = expectedCourses.map(c => c.subjectCode);
  
  let allPresent = true;
  for (const expected of expectedSubjectCodes) {
    if (!parsedSubjectCodes.includes(expected)) {
      console.log(`❌ Missing subject code: ${expected}`);
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log(`✅ PASS: All ${expectedSubjectCodes.length} expected subject codes found`);
    passed++;
  } else {
    console.log(`❌ FAIL: Some expected subject codes missing`);
    failed++;
  }
  console.log();

  // Test 3: Verify each expected course in detail
  console.log('Test 3: Detailed course validation');
  for (let i = 0; i < expectedCourses.length; i++) {
    const exp = expectedCourses[i];
    const actual = courses[i];

    if (!actual) {
      console.log(`❌ FAIL: Course ${i + 1} not found - ${exp.subjectCode} ${exp.section}`);
      failed++;
      continue;
    }

    const tests = [
      { field: 'subjectCode', expected: exp.subjectCode, actual: actual.subjectCode },
      { field: 'section', expected: exp.section, actual: actual.section },
      { field: 'title', expected: exp.title, actual: actual.title }
    ];

    let coursePassed = true;
    for (const test of tests) {
      if (test.expected !== test.actual) {
        console.log(`❌ FAIL: Course ${i + 1} ${test.field}: expected "${test.expected}", got "${test.actual}"`);
        coursePassed = false;
      }
    }

    if (coursePassed) {
      console.log(`✅ PASS: Course ${i + 1}: ${actual.subjectCode} ${actual.section} - ${actual.title}`);
      passed++;
    } else {
      failed++;
    }
  }
  console.log();

  // Test 4: Compute subject prefix breakdown
  console.log('Test 4: Subject prefix breakdown');
  const subjectPrefixCounts = {};
  for (const course of courses) {
    const prefix = getSubjectPrefix(course.subjectCode);
    subjectPrefixCounts[prefix] = (subjectPrefixCounts[prefix] || 0) + 1;
  }
  
  const expectedPrefixes = { PEPC: 3, NSTP: 1, PHYED: 1 };
  let prefixesCorrect = true;
  
  console.log('   Expected:', expectedPrefixes);
  console.log('   Actual:  ', subjectPrefixCounts);
  
  for (const [prefix, count] of Object.entries(expectedPrefixes)) {
    if (subjectPrefixCounts[prefix] !== count) {
      console.log(`❌ FAIL: ${prefix} count mismatch - expected ${count}, got ${subjectPrefixCounts[prefix] || 0}`);
      prefixesCorrect = false;
    }
  }
  
  if (prefixesCorrect) {
    console.log(`✅ PASS: Subject prefix breakdown matches expected`);
    passed++;
  } else {
    failed++;
  }
  console.log();

  // Test 5: Validate courses pass validation functions
  console.log('Test 5: All courses pass validation functions');
  try {
    let validCount = 0;
    let invalidCount = 0;
    
    for (const course of courses) {
      // Check not a header
      if (isHeaderLikeRecord(course)) {
        console.log(`   ⚠️  ${course.subjectCode} flagged as header`);
        invalidCount++;
        continue;
      }
      
      // Add term_code for validation (required by validateScheduleRecord)
      const courseWithTerm = { ...course, term_code: '2025-1' };
      
      // Check passes validation
      if (!validateScheduleRecord(courseWithTerm)) {
        console.log(`   ⚠️  ${course.subjectCode} failed validation`);
        invalidCount++;
        continue;
      }
      
      validCount++;
    }
    
    if (validCount === courses.length && invalidCount === 0) {
      console.log(`✅ PASS: All ${courses.length} courses passed validation`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${validCount}/${courses.length} courses passed validation`);
      console.log(`   ${invalidCount} courses failed validation`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Validation threw error: ${error.message}`);
    failed++;
  }
  console.log();

  // Final summary
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the test
testPESubjectParsing().catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});
