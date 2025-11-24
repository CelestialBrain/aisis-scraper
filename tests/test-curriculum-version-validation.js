/**
 * Test suite for curriculum version validation
 * 
 * Tests the enhanced isProgramMatch validation function that now checks
 * for version consistency between degCode and programTitle to prevent
 * session bleed issues where old curriculum versions contaminate new ones.
 */

import { 
  isProgramMatch, 
  extractVersionFromDegCode, 
  extractVersionFromProgramTitle,
  parseCurriculumHtml 
} from '../src/curriculum-parser.js';

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
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual: ${actualStr}`);
    testsFailed++;
  }
}

// Test Suite 1: extractVersionFromDegCode
console.log('\n📋 Test Suite 1: extractVersionFromDegCode\n');

assertEquals(
  extractVersionFromDegCode('BS MGT_2025_1'),
  { year: 2025, sem: 1 },
  'Test 1.1: Extract version from BS MGT_2025_1'
);

assertEquals(
  extractVersionFromDegCode('AB DS_2024_2'),
  { year: 2024, sem: 2 },
  'Test 1.2: Extract version from AB DS_2024_2'
);

assertEquals(
  extractVersionFromDegCode('BS ME_2020_1'),
  { year: 2020, sem: 1 },
  'Test 1.3: Extract version from BS ME_2020_1'
);

assertEquals(
  extractVersionFromDegCode('BS CS'),
  { year: null, sem: null },
  'Test 1.4: No version in degCode (too short)'
);

assertEquals(
  extractVersionFromDegCode(''),
  { year: null, sem: null },
  'Test 1.5: Empty degCode'
);

assertEquals(
  extractVersionFromDegCode(null),
  { year: null, sem: null },
  'Test 1.6: Null degCode'
);

// Test Suite 2: extractVersionFromProgramTitle
console.log('\n📋 Test Suite 2: extractVersionFromProgramTitle\n');

assertEquals(
  extractVersionFromProgramTitle('BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)'),
  { year: 2018, sem: 1 },
  'Test 2.1: Extract version from "Ver Sem 1, Ver Year 2018"'
);

assertEquals(
  extractVersionFromProgramTitle('BS Management (Ver Year 2020, Ver Sem 1)'),
  { year: 2020, sem: 1 },
  'Test 2.2: Extract version from "Ver Year 2020, Ver Sem 1" (alternate order)'
);

assertEquals(
  extractVersionFromProgramTitle('BACHELOR OF SCIENCE IN MANAGEMENT (Ver. Sem 2, Ver. Year 2025)'),
  { year: 2025, sem: 2 },
  'Test 2.3: Extract version with periods "Ver. Sem 2, Ver. Year 2025"'
);

assertEquals(
  extractVersionFromProgramTitle('BS Computer Science'),
  { year: null, sem: null },
  'Test 2.4: No version in title'
);

assertEquals(
  extractVersionFromProgramTitle('BACHELOR OF SCIENCE IN MANAGEMENT'),
  { year: null, sem: null },
  'Test 2.5: No version in long title'
);

assertEquals(
  extractVersionFromProgramTitle(''),
  { year: null, sem: null },
  'Test 2.6: Empty title'
);

assertEquals(
  extractVersionFromProgramTitle(null),
  { year: null, sem: null },
  'Test 2.7: Null title'
);

// Test Suite 3: isProgramMatch with version validation - MATCHING cases
console.log('\n📋 Test Suite 3: isProgramMatch - Version MATCHING cases\n');

assert(
  isProgramMatch(
    'BS MGT_2020_1',
    'BS Management (2020-1)',
    'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2020)'
  ),
  'Test 3.1: Version matches - degCode=2020-1, title=Ver Year 2020, Ver Sem 1'
);

assert(
  isProgramMatch(
    'BS MGT_2025_2',
    'BS Management (2025-2)',
    'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 2, Ver Year 2025)'
  ),
  'Test 3.2: Version matches - degCode=2025-2, title=Ver Year 2025, Ver Sem 2'
);

assert(
  isProgramMatch(
    'AB DS_2024_1',
    'AB Development Studies (2024-1)',
    'AB Development Studies (Ver Year 2024, Ver Sem 1)'
  ),
  'Test 3.3: Version matches - alternate order in title'
);

assert(
  isProgramMatch(
    'BS CS_2024_1',
    'BS Computer Science (2024-1)',
    'BS Computer Science'
  ),
  'Test 3.4: degCode has version, title does NOT - should still match (no rejection)'
);

assert(
  isProgramMatch(
    'BS ME_2025_1',
    'BS Mechanical Engineering (2025-1)',
    'BACHELOR OF SCIENCE IN MECHANICAL ENGINEERING'
  ),
  'Test 3.5: degCode has version, expanded title does NOT - should still match'
);

// Test Suite 4: isProgramMatch with version validation - MISMATCH cases
console.log('\n📋 Test Suite 4: isProgramMatch - Version MISMATCH cases\n');

assert(
  !isProgramMatch(
    'BS MGT_2025_1',
    'BS Management (2025-1)',
    'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)'
  ),
  'Test 4.1: Version MISMATCH - degCode=2025, title=2018 - should REJECT'
);

assert(
  !isProgramMatch(
    'BS MGT_2025_1',
    'BS Management (2025-1)',
    'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 2, Ver Year 2025)'
  ),
  'Test 4.2: Semester MISMATCH - degCode=sem 1, title=sem 2 - should REJECT'
);

assert(
  !isProgramMatch(
    'BS MGT_2020_1',
    'BS Management (2020-1)',
    'BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 2, Ver Year 2025)'
  ),
  'Test 4.3: Both year and semester MISMATCH - should REJECT'
);

assert(
  !isProgramMatch(
    'AB DS_2024_1',
    'AB Development Studies (2024-1)',
    'AB Development Studies (Ver Year 2020, Ver Sem 1)'
  ),
  'Test 4.4: Year MISMATCH - degCode=2024, title=2020 - should REJECT'
);

// Test Suite 5: parseCurriculumHtml with version mismatch
console.log('\n📋 Test Suite 5: parseCurriculumHtml with version mismatch\n');

// HTML with version that MATCHES degCode
const matchingVersionHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2020)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 20.0 Units</td></tr>
        <tr>
          <td class="text02">AC 11</td>
          <td class="text02">Financial Accounting</td>
          <td class="text02">3.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  const rows = parseCurriculumHtml(matchingVersionHTML, 'BS MGT_2020_1', 'BS Management (2020-1)');
  assert(rows.length === 1, 'Test 5.1: Matching version HTML parses successfully');
  assert(rows[0].course_code === 'AC 11', 'Test 5.1b: Parsed course code is correct');
} catch (error) {
  assert(false, `Test 5.1: Matching version should not throw - ${error.message}`);
}

// HTML with version that MISMATCHES degCode (session bleed)
const mismatchedVersionHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 20.0 Units</td></tr>
        <tr>
          <td class="text02">AC 11</td>
          <td class="text02">Financial Accounting</td>
          <td class="text02">3.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  parseCurriculumHtml(mismatchedVersionHTML, 'BS MGT_2025_1', 'BS Management (2025-1)');
  assert(false, 'Test 5.2: Mismatched version HTML should throw error');
} catch (error) {
  assert(
    error.message.includes('Curriculum HTML mismatch'),
    'Test 5.2: Error message indicates mismatch'
  );
  assert(
    error.message.includes('BS MGT_2025_1'),
    'Test 5.2b: Error message includes requested degCode'
  );
}

// HTML with NO version (should accept based on program name only)
const noVersionHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BACHELOR OF SCIENCE IN MANAGEMENT</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 20.0 Units</td></tr>
        <tr>
          <td class="text02">AC 11</td>
          <td class="text02">Financial Accounting</td>
          <td class="text02">3.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  const rows = parseCurriculumHtml(noVersionHTML, 'BS MGT_2025_1', 'BS Management (2025-1)');
  assert(rows.length === 1, 'Test 5.3: No version in HTML - accepts based on program name');
  assert(rows[0].course_code === 'AC 11', 'Test 5.3b: Parsed course code is correct');
} catch (error) {
  assert(false, `Test 5.3: No version HTML should not throw - ${error.message}`);
}

// Test Suite 6: Real-world scenario from problem statement
console.log('\n📋 Test Suite 6: Real-world BS MGT session bleed scenario\n');

// Simulate the exact scenario from the problem statement:
// degCode indicates BS MGT_2025_1 but HTML has Ver Year 2018
const realWorldBleedHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 21.0 Units</td></tr>
        <tr>
          <td class="text02">AC 11</td>
          <td class="text02">Financial Accounting</td>
          <td class="text02">3.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  parseCurriculumHtml(realWorldBleedHTML, 'BS MGT_2025_1', 'BS Management (2025-1)');
  assert(false, 'Test 6.1: Real-world bleed (2025 degCode, 2018 title) should be REJECTED');
} catch (error) {
  assert(
    error.message.includes('Curriculum HTML mismatch'),
    'Test 6.1: Real-world bleed detected and rejected'
  );
}

// Correct version should work
const realWorldCorrectHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2025)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 21.0 Units</td></tr>
        <tr>
          <td class="text02">AC 11</td>
          <td class="text02">Financial Accounting</td>
          <td class="text02">3.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  const rows = parseCurriculumHtml(realWorldCorrectHTML, 'BS MGT_2025_1', 'BS Management (2025-1)');
  assert(rows.length === 1, 'Test 6.2: Correct version (2025 degCode, 2025 title) is ACCEPTED');
} catch (error) {
  assert(false, `Test 6.2: Correct version should not throw - ${error.message}`);
}

// Print summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Summary');
console.log('═══════════════════════════════════════════════════════');
console.log(`Total tests: ${testsRun}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════\n');

if (testsFailed === 0) {
  console.log('✅ All version validation tests passed!');
  process.exit(0);
} else {
  console.error(`❌ ${testsFailed} test(s) failed`);
  process.exit(1);
}
