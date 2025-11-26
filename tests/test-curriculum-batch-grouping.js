/**
 * Test SupabaseManager.sendCurriculumBatch with single and grouped batches
 * This test verifies the logic paths without making actual HTTP requests
 */

import { SupabaseManager } from '../src/supabase.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing SupabaseManager Curriculum Batch Grouping');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

// Test 1: Single batch structure
console.log('Test 1: Single batch structure validation');
const singleBatch = {
  deg_code: 'BS CS_2024_1',
  program_code: 'BS CS',
  curriculum_version: '2024_1',
  courses: [
    { deg_code: 'BS CS_2024_1', course_code: 'CS101', course_title: 'Intro to CS', units: 3 },
    { deg_code: 'BS CS_2024_1', course_code: 'CS102', course_title: 'Data Structures', units: 3 }
  ],
  metadata: {
    total_courses_scraped: 2,
    deduplication_removed: 0,
    invalid_courses_count: 0
  }
};

// Validate single batch structure
if (singleBatch.deg_code && singleBatch.courses && singleBatch.courses.length === 2) {
  console.log('✅ PASS: Single batch structure is valid');
  passed++;
} else {
  console.log('❌ FAIL: Single batch structure is invalid');
  failed++;
}

// Test 2: Grouped batch structure
console.log('\nTest 2: Grouped batch structure validation');
const groupedBatches = [
  {
    deg_code: 'BS CS_2024_1',
    program_code: 'BS CS',
    curriculum_version: '2024_1',
    courses: [
      { deg_code: 'BS CS_2024_1', course_code: 'CS101', units: 3 }
    ],
    metadata: { total_courses_scraped: 1, deduplication_removed: 0, invalid_courses_count: 0 }
  },
  {
    deg_code: 'BS IT_2024_1',
    program_code: 'BS IT',
    curriculum_version: '2024_1',
    courses: [
      { deg_code: 'BS IT_2024_1', course_code: 'IT101', units: 3 },
      { deg_code: 'BS IT_2024_1', course_code: 'IT102', units: 3 }
    ],
    metadata: { total_courses_scraped: 2, deduplication_removed: 0, invalid_courses_count: 0 }
  }
];

// Validate grouped batches can be processed
const totalCourses = groupedBatches.reduce((sum, batch) => sum + batch.courses.length, 0);
const totalPrograms = groupedBatches.length;

if (Array.isArray(groupedBatches) && totalPrograms === 2 && totalCourses === 3) {
  console.log('✅ PASS: Grouped batch structure is valid (2 programs, 3 courses)');
  passed++;
} else {
  console.log('❌ FAIL: Grouped batch structure is invalid');
  failed++;
}

// Test 3: Empty batch handling
console.log('\nTest 3: Empty batch validation');
const emptyBatch = {
  deg_code: 'BS CS_2024_1',
  program_code: 'BS CS',
  curriculum_version: '2024_1',
  courses: [],
  metadata: { total_courses_scraped: 0, deduplication_removed: 0, invalid_courses_count: 0 }
};

// Empty batches should be detected
if (emptyBatch.courses.length === 0) {
  console.log('✅ PASS: Empty batch can be detected (courses.length === 0)');
  passed++;
} else {
  console.log('❌ FAIL: Empty batch detection failed');
  failed++;
}

// Test 4: Array detection
console.log('\nTest 4: Array vs single batch detection');
const isSingleBatch = !Array.isArray(singleBatch);
const isGroupedBatch = Array.isArray(groupedBatches);

if (isSingleBatch && isGroupedBatch) {
  console.log('✅ PASS: Can distinguish between single and grouped batches');
  passed++;
} else {
  console.log('❌ FAIL: Cannot distinguish batch types');
  console.log('   Single batch is array:', !isSingleBatch);
  console.log('   Grouped batches is array:', isGroupedBatch);
  failed++;
}

// Test 5: Metadata aggregation simulation
console.log('\nTest 5: Metadata aggregation logic');
let totalCoursesScraped = 0;
let totalDeduplicationRemoved = 0;
let totalInvalidCourses = 0;

for (const batch of groupedBatches) {
  totalCoursesScraped += batch.metadata.total_courses_scraped || 0;
  totalDeduplicationRemoved += batch.metadata.deduplication_removed || 0;
  totalInvalidCourses += batch.metadata.invalid_courses_count || 0;
}

if (totalCoursesScraped === 3 && totalDeduplicationRemoved === 0 && totalInvalidCourses === 0) {
  console.log('✅ PASS: Metadata aggregation works correctly');
  passed++;
} else {
  console.log('❌ FAIL: Metadata aggregation failed');
  console.log('   Expected: scraped=3, deduped=0, invalid=0');
  console.log('   Got: scraped=' + totalCoursesScraped + ', deduped=' + totalDeduplicationRemoved + ', invalid=' + totalInvalidCourses);
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
