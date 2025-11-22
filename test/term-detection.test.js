import * as cheerio from 'cheerio';
import assert from 'assert';

/**
 * Test fixtures and unit tests for term detection logic
 */

// Sample HTML fixture with selected option
const htmlWithSelected = `
<html>
  <body>
    <form>
      <select name="applicablePeriod">
        <option value="2024-0">Intersession 2024</option>
        <option value="2024-1">First Semester 2024-2025</option>
        <option value="2024-2" selected>Second Semester 2024-2025</option>
        <option value="2025-0">Intersession 2025</option>
        <option value="2025-1">First Semester 2025-2026</option>
      </select>
    </form>
  </body>
</html>
`;

// Sample HTML fixture without selected option (should use first)
const htmlWithoutSelected = `
<html>
  <body>
    <form>
      <select name="applicablePeriod">
        <option value="2025-1">First Semester 2025-2026</option>
        <option value="2025-2">Second Semester 2025-2026</option>
      </select>
    </form>
  </body>
</html>
`;

// Sample HTML fixture with no select element
const htmlWithoutSelect = `
<html>
  <body>
    <form>
      <input type="text" name="applicablePeriod" value="2024-2" />
    </form>
  </body>
</html>
`;

// Sample HTML fixture with empty select
const htmlWithEmptySelect = `
<html>
  <body>
    <form>
      <select name="applicablePeriod">
      </select>
    </form>
  </body>
</html>
`;

/**
 * Simulates the term detection logic from _detectCurrentTerm
 */
function detectTermFromHTML(html) {
  const $ = cheerio.load(html);
  const select = $('select[name="applicablePeriod"]');
  
  if (select.length === 0) {
    throw new Error('Cannot find applicablePeriod select element');
  }

  // Try to find selected option first
  let selectedOption = select.find('option[selected]').first();
  
  // If no option is explicitly selected, use the first option
  if (selectedOption.length === 0) {
    selectedOption = select.find('option').first();
  }

  if (selectedOption.length === 0) {
    throw new Error('No options found in applicablePeriod select');
  }

  const termValue = selectedOption.attr('value');
  const termText = selectedOption.text().trim();

  if (!termValue) {
    throw new Error('Selected option has no value attribute');
  }

  return { value: termValue, text: termText };
}

// Run tests
console.log('🧪 Running term detection tests...\n');

try {
  // Test 1: HTML with selected option
  console.log('Test 1: HTML with selected option');
  const result1 = detectTermFromHTML(htmlWithSelected);
  assert.strictEqual(result1.value, '2024-2', 'Should detect 2024-2 as selected term');
  assert.strictEqual(result1.text, 'Second Semester 2024-2025', 'Should extract correct text');
  console.log('✅ PASSED - Detected term:', result1.value, '(' + result1.text + ')');

  // Test 2: HTML without selected option (use first)
  console.log('\nTest 2: HTML without selected option (should use first)');
  const result2 = detectTermFromHTML(htmlWithoutSelected);
  assert.strictEqual(result2.value, '2025-1', 'Should use first option when none selected');
  assert.strictEqual(result2.text, 'First Semester 2025-2026', 'Should extract correct text');
  console.log('✅ PASSED - Detected term:', result2.value, '(' + result2.text + ')');

  // Test 3: HTML without select element (should throw)
  console.log('\nTest 3: HTML without select element (should throw)');
  try {
    detectTermFromHTML(htmlWithoutSelect);
    console.log('❌ FAILED - Should have thrown error');
    process.exit(1);
  } catch (error) {
    assert(error.message.includes('Cannot find applicablePeriod select element'));
    console.log('✅ PASSED - Correctly threw error:', error.message);
  }

  // Test 4: HTML with empty select (should throw)
  console.log('\nTest 4: HTML with empty select (should throw)');
  try {
    detectTermFromHTML(htmlWithEmptySelect);
    console.log('❌ FAILED - Should have thrown error');
    process.exit(1);
  } catch (error) {
    assert(error.message.includes('No options found'));
    console.log('✅ PASSED - Correctly threw error:', error.message);
  }

  console.log('\n✅ All tests passed!');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
