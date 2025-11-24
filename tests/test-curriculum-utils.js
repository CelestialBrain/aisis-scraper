/**
 * Test suite for curriculum-utils module
 * 
 * Tests deduplication, validation, and grouping utilities
 */

import { 
  dedupeCourses, 
  validateCourse, 
  filterValidCourses, 
  groupByProgramVersion,
  extractProgramInfo,
  buildBatchMetadata
} from '../src/curriculum-utils.js';
import { normalizeCourseCode } from '../src/constants.js';

// Test counter
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  testsRun++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual: ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

// Test Suite 1: normalizeCourseCode
console.log('\n📋 Test Suite 1: Course Code Normalization\n');

assert(
  normalizeCourseCode('CS 11') === 'CS 11',
  'Test 1.1: Already normalized code stays the same'
);

assert(
  normalizeCourseCode('CS11') === 'CS 11',
  'Test 1.2: Code without space gets normalized (CS11 -> CS 11)'
);

assert(
  normalizeCourseCode('CS-11') === 'CS 11',
  'Test 1.3: Code with hyphen gets normalized (CS-11 -> CS 11)'
);

assert(
  normalizeCourseCode('  CS  11  ') === 'CS 11',
  'Test 1.4: Extra whitespace is removed'
);

assert(
  normalizeCourseCode('cs 11') === 'CS 11',
  'Test 1.5: Lowercase is converted to uppercase'
);

assert(
  normalizeCourseCode('MA 18a') === 'MA 18A',
  'Test 1.6: Lowercase suffix is converted to uppercase'
);

assert(
  normalizeCourseCode('MGT-H') === 'MGT-H',
  'Test 1.7: Hyphen within code is preserved (MGT-H)'
);

assert(
  normalizeCourseCode('NSTP (ADAST)') === 'NSTP (ADAST)',
  'Test 1.8: Parentheses are preserved'
);

assert(
  normalizeCourseCode('') === '',
  'Test 1.9: Empty string returns empty string'
);

assert(
  normalizeCourseCode(null) === '',
  'Test 1.10: Null returns empty string'
);

// Test Suite 2: dedupeCourses
console.log('\n📋 Test Suite 2: Course Deduplication\n');

const duplicateCourses = [
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 11',
    course_title: 'Introduction to Computing',
    units: 3,
    year_level: 1,
    semester: 1
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS11', // Different format, same course
    course_title: 'Introduction to Computing',
    units: 3,
    year_level: 1,
    semester: 1
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'MA 18a',
    course_title: 'Calculus I',
    units: 5,
    year_level: 1,
    semester: 1
  }
];

const deduped = dedupeCourses(duplicateCourses);
assert(
  deduped.length === 2,
  'Test 2.1: Deduplication removes exact duplicates (3 -> 2 courses)'
);

assert(
  deduped.some(c => c.course_code === 'CS11'), // Last one wins
  'Test 2.2: Last occurrence wins for duplicates'
);

// Test with different year levels (should NOT be deduplicated)
const differentYears = [
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 11',
    course_title: 'Introduction to Computing',
    units: 3,
    year_level: 1,
    semester: 1
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 11',
    course_title: 'Introduction to Computing',
    units: 3,
    year_level: 2,
    semester: 1
  }
];

const notDeduped = dedupeCourses(differentYears);
assert(
  notDeduped.length === 2,
  'Test 2.3: Same course in different year levels are kept separate'
);

// Test Suite 3: validateCourse
console.log('\n📋 Test Suite 3: Course Validation\n');

const validCourse = {
  deg_code: 'BS CS_2024_1',
  course_code: 'CS 11',
  course_title: 'Introduction to Computing',
  units: 3,
  year_level: 1,
  semester: 1
};

const validation1 = validateCourse(validCourse);
assert(
  validation1.valid === true,
  'Test 3.1: Valid course passes validation'
);
assert(
  validation1.errors.length === 0,
  'Test 3.1b: Valid course has no errors'
);

const missingCode = {
  deg_code: 'BS CS_2024_1',
  course_code: '',
  course_title: 'Some Course',
  units: 3
};

const validation2 = validateCourse(missingCode);
assert(
  validation2.valid === false,
  'Test 3.2: Course with empty code fails validation'
);
assert(
  validation2.errors.some(e => e.includes('course_code')),
  'Test 3.2b: Error mentions missing course_code'
);

const missingTitle = {
  deg_code: 'BS CS_2024_1',
  course_code: 'CS 11',
  course_title: '',
  units: 3
};

const validation3 = validateCourse(missingTitle);
assert(
  validation3.valid === false,
  'Test 3.3: Course with empty title fails validation'
);

const invalidUnits = {
  deg_code: 'BS CS_2024_1',
  course_code: 'CS 11',
  course_title: 'Some Course',
  units: -1
};

const validation4 = validateCourse(invalidUnits);
assert(
  validation4.valid === false,
  'Test 3.4: Course with negative units fails validation'
);

const zeroUnits = {
  deg_code: 'BS CS_2024_1',
  course_code: 'NSTP 1',
  course_title: 'NSTP',
  units: 0,
  year_level: 1,
  semester: 1
};

const validation5 = validateCourse(zeroUnits);
assert(
  validation5.valid === true,
  'Test 3.5: Course with 0 units is valid (e.g., NSTP, residency)'
);

// Test Suite 4: filterValidCourses
console.log('\n📋 Test Suite 4: Filter Valid Courses\n');

const mixedCourses = [
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 11',
    course_title: 'Introduction to Computing',
    units: 3
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: '',
    course_title: 'Invalid Course',
    units: 3
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'MA 18a',
    course_title: 'Calculus I',
    units: 5
  }
];

const filtered = filterValidCourses(mixedCourses);
assert(
  filtered.valid.length === 2,
  'Test 4.1: Filters out invalid courses (3 -> 2 valid)'
);
assert(
  filtered.invalid.length === 1,
  'Test 4.2: Captures invalid courses (1 invalid)'
);
assert(
  filtered.invalid[0].errors.length > 0,
  'Test 4.3: Invalid course has error messages'
);

// Test Suite 5: groupByProgramVersion
console.log('\n📋 Test Suite 5: Group by Program Version\n');

const multiProgramCourses = [
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 11',
    course_title: 'Intro to Computing',
    units: 3
  },
  {
    deg_code: 'BS CS_2024_1',
    course_code: 'CS 21',
    course_title: 'Data Structures',
    units: 3
  },
  {
    deg_code: 'BS ME_2025_1',
    course_code: 'ME 11',
    course_title: 'Statics',
    units: 3
  }
];

const grouped = groupByProgramVersion(multiProgramCourses);
assert(
  grouped.size === 2,
  'Test 5.1: Groups into 2 program versions'
);
assert(
  grouped.get('BS CS_2024_1').length === 2,
  'Test 5.2: BS CS_2024_1 has 2 courses'
);
assert(
  grouped.get('BS ME_2025_1').length === 1,
  'Test 5.3: BS ME_2025_1 has 1 course'
);

// Test Suite 6: extractProgramInfo
console.log('\n📋 Test Suite 6: Extract Program Info\n');

const info1 = extractProgramInfo('BS CS_2024_1');
assertEquals(
  info1,
  { programCode: 'BS CS', curriculumVersion: '2024_1' },
  'Test 6.1: Extracts program code and version correctly'
);

const info2 = extractProgramInfo('AB DS_2023_2');
assertEquals(
  info2,
  { programCode: 'AB DS', curriculumVersion: '2023_2' },
  'Test 6.2: Handles different program codes'
);

const info3 = extractProgramInfo('BS MGT-H_2025_1');
assertEquals(
  info3,
  { programCode: 'BS MGT-H', curriculumVersion: '2025_1' },
  'Test 6.3: Handles hyphenated program codes'
);

// Test Suite 7: buildBatchMetadata
console.log('\n📋 Test Suite 7: Build Batch Metadata\n');

const rawCourses = [
  { deg_code: 'BS CS_2024_1', course_code: 'CS 11', course_title: 'Intro', units: 3 },
  { deg_code: 'BS CS_2024_1', course_code: 'CS11', course_title: 'Intro', units: 3 }, // duplicate
  { deg_code: 'BS CS_2024_1', course_code: '', course_title: 'Invalid', units: 3 } // invalid
];

const metadata = buildBatchMetadata('BS CS_2024_1', rawCourses, [rawCourses[0]], 1, 1);
assert(
  metadata.program_code === 'BS CS',
  'Test 7.1: Metadata includes program code'
);
assert(
  metadata.curriculum_version === '2024_1',
  'Test 7.2: Metadata includes curriculum version'
);
assert(
  metadata.total_courses_scraped === 3,
  'Test 7.3: Metadata includes total scraped count'
);
assert(
  metadata.deduplication_removed === 1,
  'Test 7.4: Metadata includes deduplication count'
);
assert(
  metadata.invalid_courses_count === 1,
  'Test 7.5: Metadata includes invalid count'
);
assert(
  metadata.final_course_count === 1,
  'Test 7.6: Metadata includes final valid count'
);
assert(
  metadata.scraped_at,
  'Test 7.7: Metadata includes timestamp'
);
assert(
  metadata.source_url === 'https://aisis.ateneo.edu/J_VOFC.do',
  'Test 7.8: Metadata includes source URL'
);

// Test Suite 8: Integration test - full pipeline
console.log('\n📋 Test Suite 8: Full Pipeline Integration\n');

const pipelineInput = [
  { deg_code: 'BS CS_2024_1', course_code: 'CS 11', course_title: 'Intro to Computing', units: 3, year_level: 1, semester: 1 },
  { deg_code: 'BS CS_2024_1', course_code: 'CS11', course_title: 'Intro to Computing', units: 3, year_level: 1, semester: 1 }, // dup
  { deg_code: 'BS CS_2024_1', course_code: 'MA 18a', course_title: 'Calculus I', units: 5, year_level: 1, semester: 1 },
  { deg_code: 'BS CS_2024_1', course_code: '', course_title: 'Invalid', units: 3, year_level: 1, semester: 1 }, // invalid
  { deg_code: 'BS ME_2025_1', course_code: 'ME 11', course_title: 'Statics', units: 3, year_level: 1, semester: 1 }
];

// Step 1: Deduplicate
const dedupedPipeline = dedupeCourses(pipelineInput);
assert(
  dedupedPipeline.length === 4,
  'Test 8.1: Deduplication removes 1 duplicate (5 -> 4)'
);

// Step 2: Filter valid
const { valid: validPipeline, invalid: invalidPipeline } = filterValidCourses(dedupedPipeline);
assert(
  validPipeline.length === 3,
  'Test 8.2: Validation removes 1 invalid (4 -> 3 valid)'
);
assert(
  invalidPipeline.length === 1,
  'Test 8.2b: 1 course marked invalid'
);

// Step 3: Group by program
const groupedPipeline = groupByProgramVersion(validPipeline);
assert(
  groupedPipeline.size === 2,
  'Test 8.3: Grouped into 2 programs'
);
assert(
  groupedPipeline.get('BS CS_2024_1').length === 2,
  'Test 8.4: BS CS has 2 valid courses'
);
assert(
  groupedPipeline.get('BS ME_2025_1').length === 1,
  'Test 8.5: BS ME has 1 valid course'
);

// Print summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Summary');
console.log('═══════════════════════════════════════════════════════');
console.log(`Total tests: ${testsRun}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════\n');

if (testsFailed === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.error(`❌ ${testsFailed} test(s) failed`);
  process.exit(1);
}
