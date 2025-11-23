/**
 * Simple test to verify program_title extraction from curriculum HTML
 */

import { parseCurriculumHtml } from './src/curriculum-parser.js';

// Test case: Simple HTML with a header
const testHtml1 = `
<html>
  <body>
    <table>
      <tr>
        <td class="header06">Bachelor of Science in Computer Science (BS CS) - 2024</td>
      </tr>
      <tr>
        <td class="text06">First Year</td>
      </tr>
      <tr>
        <td class="text04">First Semester - 18.0 Units</td>
      </tr>
      <tr>
        <td class="text02">CSCI 101</td>
        <td class="text02">Introduction to Programming</td>
        <td class="text02">3.0</td>
        <td class="text02"></td>
        <td class="text02">M</td>
      </tr>
    </table>
  </body>
</html>
`;

// Test case: HTML without a clear header (should fall back to label)
const testHtml2 = `
<html>
  <body>
    <table>
      <tr>
        <td class="text06">First Year</td>
      </tr>
      <tr>
        <td class="text02">MATH 101</td>
        <td class="text02">Calculus I</td>
        <td class="text02">3.0</td>
      </tr>
    </table>
  </body>
</html>
`;

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing program_title extraction');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: HTML with header
console.log('Test 1: HTML with td.header06');
const rows1 = parseCurriculumHtml(testHtml1, 'BS CS_2024_1', 'BS Computer Science (2024-1)');
if (rows1.length > 0) {
  const title1 = rows1[0].program_title;
  console.log(`  Extracted title: "${title1}"`);
  if (title1 === 'Bachelor of Science in Computer Science (BS CS) - 2024') {
    console.log('  ✅ Correct - extracted from td.header06\n');
  } else {
    console.log('  ❌ Incorrect - expected "Bachelor of Science in Computer Science (BS CS) - 2024"\n');
  }
} else {
  console.log('  ❌ No rows parsed\n');
}

// Test 2: HTML without header (should fall back to label)
console.log('Test 2: HTML without header (fallback to label)');
const rows2 = parseCurriculumHtml(testHtml2, 'BS MATH_2023_1', 'BS Mathematics (2023-1)');
if (rows2.length > 0) {
  const title2 = rows2[0].program_title;
  console.log(`  Extracted title: "${title2}"`);
  if (title2 === 'BS Mathematics (2023-1)') {
    console.log('  ✅ Correct - fell back to label\n');
  } else {
    console.log('  ❌ Incorrect - expected "BS Mathematics (2023-1)"\n');
  }
} else {
  console.log('  ❌ No rows parsed\n');
}

// Test 3: Verify each row has the same program_title within a program
console.log('Test 3: All rows in a program have consistent program_title');
if (rows1.length > 1) {
  const allTitles = rows1.map(r => r.program_title);
  const uniqueTitles = [...new Set(allTitles)];
  if (uniqueTitles.length === 1) {
    console.log('  ✅ All rows have the same program_title\n');
  } else {
    console.log('  ❌ Rows have different program_title values\n');
  }
} else {
  console.log('  ⚠️  Only one row, skipping consistency test\n');
}

console.log('═══════════════════════════════════════════════════════');
console.log('✅ program_title extraction tests complete');
console.log('═══════════════════════════════════════════════════════');
