/**
 * Test suite for curriculum validation and session bleed prevention
 * 
 * Tests the isProgramMatch validation function and parseAllCurricula
 * error handling to ensure contaminated data is not accepted.
 */

import { isProgramMatch, parseCurriculumHtml, parseAllCurricula } from '../src/curriculum-parser.js';

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
  if (actual === expected) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual: ${actual}`);
    testsFailed++;
  }
}

// Test Suite 1: isProgramMatch validation
console.log('\n📋 Test Suite 1: isProgramMatch Validation\n');

// Test 1.1: Exact match
assert(
  isProgramMatch('BS CS_2024_1', 'BS Computer Science (2024-1)', 'BS Computer Science (2024-1)'),
  'Test 1.1: Exact match - should return true'
);

// Test 1.2: Match with slight variation
assert(
  isProgramMatch('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 'BS Mechanical Engineering'),
  'Test 1.2: Match without year suffix - should return true'
);

// Test 1.3: Match with base code in title
assert(
  isProgramMatch('BS MGT-H_2025_1', 'BS Management (Honors) (2025-1)', 'BS Management - Honors Program'),
  'Test 1.3: Match with base code and word overlap - should return true'
);

// Test 1.4: Obvious mismatch - different program
assert(
  !isProgramMatch('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 'BS Management (Honors)'),
  'Test 1.4: Mismatch - BS ME vs BS MGT-H - should return false'
);

// Test 1.5: Obvious mismatch - different degree type
assert(
  !isProgramMatch('AB DS_2024_1', 'AB Development Studies (2024-1)', 'AB Applied Mathematics'),
  'Test 1.5: Mismatch - Development Studies vs Applied Math - should return false'
);

// Test 1.6: Match with word overlap
assert(
  isProgramMatch('BS CS_2024_1', 'BS Computer Science (2024-1)', 'Bachelor of Science in Computer Science'),
  'Test 1.6: Match with expanded degree name - should return true'
);

// Test 1.7: Case insensitivity
assert(
  isProgramMatch('BS CS_2024_1', 'BS Computer Science (2024-1)', 'bs computer science'),
  'Test 1.7: Case insensitive match - should return true'
);

// Test 1.8: Whitespace normalization
assert(
  isProgramMatch('BS  ME_2025_1', 'BS   Mechanical   Engineering (2025-1)', 'BS Mechanical Engineering'),
  'Test 1.8: Whitespace normalization - should return true'
);

// Test Suite 2: parseCurriculumHtml validation
console.log('\n📋 Test Suite 2: parseCurriculumHtml Circuit Breaker\n');

// Sample valid HTML for BS CS
const validHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BS Computer Science (2024-1)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr><td class="text04">First Semester - 21.0 Units</td></tr>
        <tr>
          <td class="text02">MA 18a</td>
          <td class="text02">Analytic Geometry and Calculus I</td>
          <td class="text02">5.0</td>
          <td class="text02">None</td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

// Test 2.1: Valid HTML should parse successfully
try {
  const rows = parseCurriculumHtml(validHTML, 'BS CS_2024_1', 'BS Computer Science (2024-1)');
  assert(rows.length === 1, 'Test 2.1: Valid HTML parses successfully');
  assert(rows[0].course_code === 'MA 18a', 'Test 2.1b: Parsed course code is correct');
  assert(rows[0].program_title === 'BS Computer Science (2024-1)', 'Test 2.1c: Program title is correct');
} catch (error) {
  assert(false, `Test 2.1: Valid HTML should not throw - ${error.message}`);
}

// Sample mismatched HTML (BS MGT-H when expecting BS ME)
const mismatchedHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BS Management (Honors) (2025-1)</td></tr>
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

// Test 2.2: Mismatched HTML should throw error
try {
  const rows = parseCurriculumHtml(mismatchedHTML, 'BS ME_2025_1', 'BS Mechanical Engineering (2025-1)');
  assert(false, 'Test 2.2: Mismatched HTML should throw error');
} catch (error) {
  assert(
    error.message.includes('Curriculum HTML mismatch'),
    'Test 2.2: Error message indicates mismatch'
  );
  assert(
    error.message.includes('BS ME_2025_1'),
    'Test 2.2b: Error message includes requested degCode'
  );
}

// Test Suite 3: parseAllCurricula error handling
console.log('\n📋 Test Suite 3: parseAllCurricula Error Handling\n');

const testPrograms = [
  {
    degCode: 'BS CS_2024_1',
    label: 'BS Computer Science (2024-1)',
    html: validHTML
  },
  {
    degCode: 'BS ME_2025_1',
    label: 'BS Mechanical Engineering (2025-1)',
    html: mismatchedHTML  // This has BS MGT-H HTML, should be rejected
  },
  {
    degCode: 'BS MGT-H_2025_1',
    label: 'BS Management (Honors) (2025-1)',
    html: mismatchedHTML  // This matches, should be accepted
  }
];

// Test 3.1: parseAllCurricula should skip mismatched programs
const { programs, allRows } = parseAllCurricula(testPrograms);

assert(
  programs.length === 2,
  'Test 3.1: Should parse 2 programs (skip the mismatched one)'
);

assert(
  programs.some(p => p.degCode === 'BS CS_2024_1'),
  'Test 3.2: BS CS_2024_1 should be included'
);

assert(
  !programs.some(p => p.degCode === 'BS ME_2025_1'),
  'Test 3.3: BS ME_2025_1 should be skipped (mismatch)'
);

assert(
  programs.some(p => p.degCode === 'BS MGT-H_2025_1'),
  'Test 3.4: BS MGT-H_2025_1 should be included (matches)'
);

assert(
  allRows.length === 2,
  'Test 3.5: Should have 2 total rows (1 from each valid program)'
);

assert(
  allRows.every(row => row.deg_code !== 'BS ME_2025_1'),
  'Test 3.6: No rows should have BS ME_2025_1 deg_code'
);

// Test Suite 4: Edge cases
console.log('\n📋 Test Suite 4: Edge Cases\n');

// Test 4.1: Empty program title falls back to label
const emptyTitleHTML = `
  <html>
    <body>
      <table>
        <tr><td class="text06">First Year</td></tr>
        <tr>
          <td class="text02">MA 18a</td>
          <td class="text02">Calculus I</td>
          <td class="text02">5.0</td>
          <td class="text02"></td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  const rows = parseCurriculumHtml(emptyTitleHTML, 'BS CS_2024_1', 'BS Computer Science (2024-1)');
  assert(rows.length === 1, 'Test 4.1: Parses with missing header (uses label as fallback)');
  assert(
    rows[0].program_title === 'BS Computer Science (2024-1)',
    'Test 4.1b: Falls back to label when header missing'
  );
} catch (error) {
  assert(false, `Test 4.1: Should not throw on missing header - ${error.message}`);
}

// Test 4.2: Null HTML handling
const nullHtmlPrograms = [
  {
    degCode: 'TEST_NULL',
    label: 'Test Null',
    html: null
  }
];

const nullResult = parseAllCurricula(nullHtmlPrograms);
assert(nullResult.programs.length === 0, 'Test 4.2: Handles null HTML gracefully');
assert(nullResult.allRows.length === 0, 'Test 4.2b: No rows from null HTML');

// Test 4.3: Empty HTML handling
const emptyHtmlPrograms = [
  {
    degCode: 'TEST_EMPTY',
    label: 'Test Empty',
    html: '<html><body></body></html>'
  }
];

const emptyResult = parseAllCurricula(emptyHtmlPrograms);
assert(emptyResult.programs.length === 0, 'Test 4.3: Handles empty HTML (no courses found)');

// Test Suite 5: Real-world scenarios
console.log('\n📋 Test Suite 5: Real-World Session Bleed Scenarios\n');

// Simulate session bleed: BS ME request returns AB AM HTML
const sessionBleedHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">AB Applied Mathematics (2024-1)</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr>
          <td class="text02">MA 21</td>
          <td class="text02">Advanced Mathematics</td>
          <td class="text02">3.0</td>
          <td class="text02"></td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  parseCurriculumHtml(sessionBleedHTML, 'BS ME_2025_1', 'BS Mechanical Engineering (2025-1)');
  assert(false, 'Test 5.1: Should reject session bleed (ME -> AM)');
} catch (error) {
  assert(
    error.message.includes('Curriculum HTML mismatch'),
    'Test 5.1: Detects session bleed and throws'
  );
}

// Simulate similar programs (should still match if close enough)
const similarProgramHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BS Computer Science</td></tr>
        <tr><td class="text06">First Year</td></tr>
        <tr>
          <td class="text02">CS 21</td>
          <td class="text02">Data Structures</td>
          <td class="text02">3.0</td>
          <td class="text02"></td>
          <td class="text02">M</td>
        </tr>
      </table>
    </body>
  </html>
`;

try {
  const rows = parseCurriculumHtml(similarProgramHTML, 'BS CS_2024_1', 'BS Computer Science (2024-1)');
  assert(rows.length === 1, 'Test 5.2: Accepts similar program names (BS CS)');
} catch (error) {
  assert(false, `Test 5.2: Should accept similar names - ${error.message}`);
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
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.error(`❌ ${testsFailed} test(s) failed`);
  process.exit(1);
}
