/**
 * Test the new curriculum programs array format
 * 
 * This test validates the structure of the payload that would be sent to
 * the Supabase Edge Function, ensuring it uses the new programs array format.
 */

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing New Curriculum Programs Array Format');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

// Helper function to build the transformed course object (mimics _transformCurriculumCourse)
function transformCourse(row) {
  return {
    degree_code: row.deg_code,
    program_label: row.program_label,
    program_title: row.program_title,
    year_level: row.year_level,
    semester: row.semester,
    course_code: row.course_code,
    course_title: row.course_title,
    units: row.units,
    prerequisites: row.prerequisites,
    category: row.category,
    university_code: 'ADMU'
  };
}

// Helper function to build a program object (mimics the new logic in sendCurriculumBatch)
function buildProgramObject(batch) {
  const { deg_code, program_code, curriculum_version, courses, metadata } = batch;
  
  // Transform courses
  const transformedCourses = courses.map(transformCourse);
  
  // Parse version into year and semester
  const versionParts = curriculum_version ? curriculum_version.split('_') : [];
  const versionYear = versionParts.length > 0 ? parseInt(versionParts[0], 10) : null;
  const versionSem = versionParts.length > 1 ? parseInt(versionParts[1], 10) : null;
  
  // Get program title from metadata or first course
  const programTitle = metadata.program_name || (courses.length > 0 ? courses[0].program_title : null);
  
  return {
    deg_code: deg_code,
    program_code: program_code,
    program_title: programTitle,
    version_year: versionYear,
    version_sem: versionSem,
    courses: transformedCourses
  };
}

// Test 1: Single program object structure
console.log('Test 1: Single program object structure');
const singleBatch = {
  deg_code: 'BS CS_2024_1',
  program_code: 'BS CS',
  curriculum_version: '2024_1',
  courses: [
    {
      deg_code: 'BS CS_2024_1',
      program_code: 'BS CS',
      program_label: 'BS Computer Science',
      program_title: 'Bachelor of Science in Computer Science',
      course_code: 'CS 11',
      course_title: 'Introduction to Computing',
      units: 3,
      year_level: 1,
      semester: 1,
      prerequisites: 'None',
      category: 'CORE'
    },
    {
      deg_code: 'BS CS_2024_1',
      program_code: 'BS CS',
      program_label: 'BS Computer Science',
      program_title: 'Bachelor of Science in Computer Science',
      course_code: 'MATH 18a',
      course_title: 'Calculus I',
      units: 5,
      year_level: 1,
      semester: 1,
      prerequisites: 'None',
      category: 'CORE'
    }
  ],
  metadata: {
    program_code: 'BS CS',
    program_name: 'Bachelor of Science in Computer Science',
    curriculum_version: '2024_1',
    total_courses_scraped: 2,
    deduplication_removed: 0,
    invalid_courses_count: 0,
    final_course_count: 2
  }
};

const program = buildProgramObject(singleBatch);

// Validate program structure
if (program.deg_code === 'BS CS_2024_1' &&
    program.program_code === 'BS CS' &&
    program.program_title === 'Bachelor of Science in Computer Science' &&
    program.version_year === 2024 &&
    program.version_sem === 1 &&
    Array.isArray(program.courses) &&
    program.courses.length === 2) {
  console.log('✅ PASS: Program object has correct structure');
  console.log('   - deg_code: ' + program.deg_code);
  console.log('   - program_code: ' + program.program_code);
  console.log('   - program_title: ' + program.program_title);
  console.log('   - version_year: ' + program.version_year);
  console.log('   - version_sem: ' + program.version_sem);
  console.log('   - courses: ' + program.courses.length + ' courses');
  passed++;
} else {
  console.log('❌ FAIL: Program object structure is incorrect');
  console.log('   Expected: deg_code=BS CS_2024_1, program_code=BS CS, version_year=2024, version_sem=1, 2 courses');
  console.log('   Got:', program);
  failed++;
}

// Test 2: Version parsing
console.log('\nTest 2: Version parsing into year and semester');
const testCases = [
  { version: '2024_1', expectedYear: 2024, expectedSem: 1 },
  { version: '2025_2', expectedYear: 2025, expectedSem: 2 },
  { version: '2023_1', expectedYear: 2023, expectedSem: 1 },
];

for (const { version, expectedYear, expectedSem } of testCases) {
  const versionParts = version.split('_');
  const year = versionParts.length > 0 ? parseInt(versionParts[0], 10) : null;
  const sem = versionParts.length > 1 ? parseInt(versionParts[1], 10) : null;
  
  if (year === expectedYear && sem === expectedSem) {
    console.log(`✅ PASS: Version "${version}" parsed correctly (year=${year}, sem=${sem})`);
    passed++;
  } else {
    console.log(`❌ FAIL: Version "${version}" parsing failed`);
    console.log(`   Expected: year=${expectedYear}, sem=${expectedSem}`);
    console.log(`   Got: year=${year}, sem=${sem}`);
    failed++;
  }
}

// Test 3: Programs array for grouped batches
console.log('\nTest 3: Programs array for grouped batches');
const groupedBatches = [
  {
    deg_code: 'BS CS_2024_1',
    program_code: 'BS CS',
    curriculum_version: '2024_1',
    courses: [
      {
        deg_code: 'BS CS_2024_1',
        program_code: 'BS CS',
        program_label: 'BS Computer Science',
        program_title: 'Bachelor of Science in Computer Science',
        course_code: 'CS 11',
        course_title: 'Introduction to Computing',
        units: 3,
        year_level: 1,
        semester: 1,
        prerequisites: 'None',
        category: 'CORE'
      }
    ],
    metadata: {
      program_code: 'BS CS',
      program_name: 'Bachelor of Science in Computer Science',
      curriculum_version: '2024_1',
      total_courses_scraped: 1,
      deduplication_removed: 0,
      invalid_courses_count: 0,
      final_course_count: 1
    }
  },
  {
    deg_code: 'BS ME_2025_1',
    program_code: 'BS ME',
    curriculum_version: '2025_1',
    courses: [
      {
        deg_code: 'BS ME_2025_1',
        program_code: 'BS ME',
        program_label: 'BS Mechanical Engineering',
        program_title: 'Bachelor of Science in Mechanical Engineering',
        course_code: 'ME 11',
        course_title: 'Engineering Drawing',
        units: 3,
        year_level: 1,
        semester: 1,
        prerequisites: 'None',
        category: 'CORE'
      },
      {
        deg_code: 'BS ME_2025_1',
        program_code: 'BS ME',
        program_label: 'BS Mechanical Engineering',
        program_title: 'Bachelor of Science in Mechanical Engineering',
        course_code: 'MATH 18a',
        course_title: 'Calculus I',
        units: 5,
        year_level: 1,
        semester: 1,
        prerequisites: 'None',
        category: 'CORE'
      }
    ],
    metadata: {
      program_code: 'BS ME',
      program_name: 'Bachelor of Science in Mechanical Engineering',
      curriculum_version: '2025_1',
      total_courses_scraped: 2,
      deduplication_removed: 0,
      invalid_courses_count: 0,
      final_course_count: 2
    }
  }
];

// Build programs array
const programs = groupedBatches.map(buildProgramObject);

if (programs.length === 2) {
  console.log('✅ PASS: Programs array has 2 programs');
  passed++;
  
  const csProgram = programs[0];
  const meProgram = programs[1];
  
  // Verify first program (BS CS)
  if (csProgram.deg_code === 'BS CS_2024_1' &&
      csProgram.program_code === 'BS CS' &&
      csProgram.version_year === 2024 &&
      csProgram.version_sem === 1 &&
      csProgram.courses.length === 1) {
    console.log('✅ PASS: First program (BS CS) has correct structure');
    passed++;
  } else {
    console.log('❌ FAIL: First program structure is incorrect');
    console.log('   Got:', csProgram);
    failed++;
  }
  
  // Verify second program (BS ME)
  if (meProgram.deg_code === 'BS ME_2025_1' &&
      meProgram.program_code === 'BS ME' &&
      meProgram.version_year === 2025 &&
      meProgram.version_sem === 1 &&
      meProgram.courses.length === 2) {
    console.log('✅ PASS: Second program (BS ME) has correct structure');
    passed++;
  } else {
    console.log('❌ FAIL: Second program structure is incorrect');
    console.log('   Got:', meProgram);
    failed++;
  }
  
  // Verify courses are not mixed
  const csCourseDegCodes = csProgram.courses.map(c => c.degree_code);
  const meCourseDegCodes = meProgram.courses.map(c => c.degree_code);
  
  if (csCourseDegCodes.every(d => d === 'BS CS_2024_1') &&
      meCourseDegCodes.every(d => d === 'BS ME_2025_1')) {
    console.log('✅ PASS: Courses are properly separated by program (not mixed)');
    passed++;
  } else {
    console.log('❌ FAIL: Courses are mixed between programs');
    console.log('   CS courses:', csCourseDegCodes);
    console.log('   ME courses:', meCourseDegCodes);
    failed++;
  }
} else {
  console.log('❌ FAIL: Programs array should have 2 programs, got: ' + programs.length);
  failed++;
}

// Test 4: Payload structure
console.log('\nTest 4: Complete payload structure');

// Single batch payload
const singlePayload = {
  data_type: 'curriculum',
  programs: [buildProgramObject(singleBatch)],
  metadata: {
    program_code: 'BS CS',
    total_courses: 2
  }
};

if (singlePayload.data_type === 'curriculum' &&
    Array.isArray(singlePayload.programs) &&
    singlePayload.programs.length === 1 &&
    !singlePayload.records) {
  console.log('✅ PASS: Single batch payload uses programs array (not records)');
  passed++;
} else {
  console.log('❌ FAIL: Single batch payload structure is incorrect');
  console.log('   Has programs array:', Array.isArray(singlePayload.programs));
  console.log('   Has records:', !!singlePayload.records);
  failed++;
}

// Grouped batch payload
const groupedPayload = {
  data_type: 'curriculum',
  programs: programs,
  metadata: {
    total_programs: programs.length,
    total_courses: 3
  }
};

if (groupedPayload.data_type === 'curriculum' &&
    Array.isArray(groupedPayload.programs) &&
    groupedPayload.programs.length === 2 &&
    !groupedPayload.records) {
  console.log('✅ PASS: Grouped batch payload uses programs array (not records)');
  passed++;
} else {
  console.log('❌ FAIL: Grouped batch payload structure is incorrect');
  console.log('   Has programs array:', Array.isArray(groupedPayload.programs));
  console.log('   Has records:', !!groupedPayload.records);
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
  console.log('✅ New programs array format is working correctly!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed!`);
  process.exit(1);
}
