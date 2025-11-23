/**
 * Test suite for AISIS error page detection
 * 
 * Tests the scraper's ability to detect and handle the AISIS system error page
 * ("Your Request Cannot Be Processed At This Time")
 */

import { AISISScraper } from '../src/scraper.js';

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

async function assertThrows(fn, expectedMessagePart, message) {
  testsRun++;
  try {
    await fn();
    console.error(`❌ ${message}`);
    console.error(`   Expected to throw but didn't`);
    testsFailed++;
  } catch (error) {
    if (error.message.includes(expectedMessagePart)) {
      console.log(`✅ ${message}`);
      testsPassed++;
    } else {
      console.error(`❌ ${message}`);
      console.error(`   Expected error message to include: ${expectedMessagePart}`);
      console.error(`   Actual error message: ${error.message}`);
      testsFailed++;
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('🧪 Testing AISIS Error Page Detection');
console.log('═══════════════════════════════════════════════════════\n');

// Test Suite 1: Error page detection
console.log('📋 Test Suite 1: Error Page Detection\n');

// Create a mock scraper for testing
class MockAISISScraper extends AISISScraper {
  constructor(username, password, mockHtmlResponse) {
    super(username, password);
    this.mockHtmlResponse = mockHtmlResponse;
    this.attemptCount = 0;
  }
  
  async _scrapeDegree(degCode) {
    this.attemptCount++;
    return this.mockHtmlResponse;
  }
  
  async _delay(ms) {
    // Skip delay in tests
    return;
  }
}

// Test 1.1: Normal HTML should not trigger error page detection
console.log('Test 1.1: Normal HTML should pass validation');
const validHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BS Computer Science (2024-1)</td></tr>
        <tr><td class="text06">First Year</td></tr>
      </table>
    </body>
  </html>
`;

try {
  const scraper1 = new MockAISISScraper('test', 'test', validHTML);
  const result = await scraper1._scrapeDegreeWithValidation(
    'BS CS_2024_1',
    'BS Computer Science (2024-1)',
    3
  );
  assert(result.includes('BS Computer Science'), 'Test 1.1: Returns HTML for valid response');
  assertEquals(scraper1.attemptCount, 1, 'Test 1.1b: Only 1 attempt needed for valid HTML');
} catch (error) {
  assert(false, `Test 1.1: Should not throw for valid HTML - ${error.message}`);
}

// Test 1.2: AISIS error page should be detected
console.log('\nTest 1.2: AISIS error page should be detected');
const errorPageHTML = `
  <html>
    <body>
      <h1>Error</h1>
      <p>Your Request Cannot Be Processed At This Time</p>
      <p>Please try again later.</p>
    </body>
  </html>
`;

try {
  const scraper2 = new MockAISISScraper('test', 'test', errorPageHTML);
  await assertThrows(
    () => scraper2._scrapeDegreeWithValidation('BS CS_2024_1', 'BS Computer Science (2024-1)', 3),
    'AISIS_ERROR_PAGE',
    'Test 1.2: Throws AISIS_ERROR_PAGE error for error page'
  );
  assertEquals(scraper2.attemptCount, 3, 'Test 1.2b: All 3 attempts exhausted before giving up');
} catch (error) {
  // assertThrows handles the test assertion
}

// Test 1.3: Error page in first attempt, valid HTML in second
console.log('\nTest 1.3: Error page in first attempt, valid HTML in second');
class MockScraperRetry extends AISISScraper {
  constructor(username, password) {
    super(username, password);
    this.attemptCount = 0;
  }
  
  async _scrapeDegree(degCode) {
    this.attemptCount++;
    // First attempt returns error page, second returns valid HTML
    if (this.attemptCount === 1) {
      return errorPageHTML;
    } else {
      return validHTML;
    }
  }
  
  async _delay(ms) {
    return; // Skip delay in tests
  }
}

try {
  const scraper3 = new MockScraperRetry('test', 'test');
  const result = await scraper3._scrapeDegreeWithValidation(
    'BS CS_2024_1',
    'BS Computer Science (2024-1)',
    3
  );
  assert(result.includes('BS Computer Science'), 'Test 1.3: Succeeds after retry');
  assertEquals(scraper3.attemptCount, 2, 'Test 1.3b: 2 attempts made (first failed, second succeeded)');
} catch (error) {
  assert(false, `Test 1.3: Should succeed on retry - ${error.message}`);
}

// Test Suite 2: Integration with validation
console.log('\n📋 Test Suite 2: Integration with Program Validation\n');

// Test 2.1: AISIS error page takes precedence over program mismatch
console.log('Test 2.1: AISIS error page detected before validation');
try {
  const scraper4 = new MockAISISScraper('test', 'test', errorPageHTML);
  await assertThrows(
    () => scraper4._scrapeDegreeWithValidation('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 3),
    'AISIS_ERROR_PAGE',
    'Test 2.1: AISIS error page detected even if program would mismatch'
  );
} catch (error) {
  // assertThrows handles the test assertion
}

// Test 2.2: Program mismatch validation still works for non-error pages
console.log('\nTest 2.2: Program mismatch validation still works');
const mismatchedHTML = `
  <html>
    <body>
      <table>
        <tr><td class="header06">BS Management (Honors) (2025-1)</td></tr>
        <tr><td class="text06">First Year</td></tr>
      </table>
    </body>
  </html>
`;

try {
  const scraper5 = new MockAISISScraper('test', 'test', mismatchedHTML);
  await assertThrows(
    () => scraper5._scrapeDegreeWithValidation('BS ME_2025_1', 'BS Mechanical Engineering (2025-1)', 3),
    'Curriculum HTML mismatch',
    'Test 2.2: Program mismatch validation still works'
  );
} catch (error) {
  // assertThrows handles the test assertion
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
