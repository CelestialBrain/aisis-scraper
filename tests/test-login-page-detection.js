/**
 * Test suite for login page detection
 * 
 * Tests the isLoginPage function which detects when the scraper receives
 * AISIS login page HTML instead of schedule data due to session expiry.
 */

import { isLoginPage } from '../src/scraper.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

console.log('\n═══════════════════════════════════════════════════════');
console.log('🧪 Testing Login Page Detection');
console.log('═══════════════════════════════════════════════════════\n');

// Test Suite 1: Basic detection patterns
console.log('📋 Test Suite 1: Basic Detection Patterns\n');

// Test 1.1: Full login page HTML should be detected
console.log('Test 1.1: Full login page HTML should be detected');
const loginPagePath = join(__dirname, 'fixtures', 'aisis-login-page.html');
const loginPageHtml = fs.readFileSync(loginPagePath, 'utf-8');
assertEquals(isLoginPage(loginPageHtml), true, 'Test 1.1: Full login page HTML detected');

// Test 1.2: Valid schedule HTML should NOT be detected as login page
console.log('\nTest 1.2: Valid schedule HTML should NOT be detected as login page');
const schedulePagePath = join(__dirname, 'fixtures', 'aisis-schedule-edge-cases.html');
const scheduleHtml = fs.readFileSync(schedulePagePath, 'utf-8');
assertEquals(isLoginPage(scheduleHtml), false, 'Test 1.2: Valid schedule HTML not detected as login');

// Test 1.3: No results page should NOT be detected as login page
console.log('\nTest 1.3: No results page should NOT be detected as login page');
const noResultsPath = join(__dirname, 'fixtures', 'aisis-no-results.html');
const noResultsHtml = fs.readFileSync(noResultsPath, 'utf-8');
assertEquals(isLoginPage(noResultsHtml), false, 'Test 1.3: No results page not detected as login');

// Test Suite 2: Edge cases and marker combinations
console.log('\n📋 Test Suite 2: Edge Cases and Marker Combinations\n');

// Test 2.1: Primary + secondary marker combination
console.log('Test 2.1: Primary + secondary marker combination');
const primarySecondaryHtml = `
<html>
  <body>
    <form action="login.do">
      <label>Username:</label>
      <input type="text" />
    </form>
  </body>
</html>
`;
assertEquals(isLoginPage(primarySecondaryHtml), true, 'Test 2.1: Primary + secondary markers detected');

// Test 2.2: Multiple primary markers
console.log('\nTest 2.2: Multiple primary markers');
const multiplePrimaryHtml = `
<html>
  <body>
    <a href="login.do">Login</a>
    <a href="displayLogin.do">Go to Login</a>
  </body>
</html>
`;
assertEquals(isLoginPage(multiplePrimaryHtml), true, 'Test 2.2: Multiple primary markers detected');

// Test 2.3: Single primary marker only (should NOT trigger)
console.log('\nTest 2.3: Single primary marker only (should NOT trigger)');
const singlePrimaryHtml = `
<html>
  <body>
    <p>Sign in to your account</p>
    <p>Course: INTAC 11</p>
  </body>
</html>
`;
assertEquals(isLoginPage(singlePrimaryHtml), false, 'Test 2.3: Single primary marker not enough');

// Test 2.4: Secondary markers only (should NOT trigger)
console.log('\nTest 2.4: Secondary markers only (should NOT trigger)');
const secondaryOnlyHtml = `
<html>
  <body>
    <label>Username:</label>
    <label>Password:</label>
    <p>Contact itsupport@ateneo.edu for help</p>
  </body>
</html>
`;
assertEquals(isLoginPage(secondaryOnlyHtml), false, 'Test 2.4: Secondary markers only not enough');

// Test 2.5: Null/undefined/empty input
console.log('\nTest 2.5: Null/undefined/empty input');
assertEquals(isLoginPage(null), false, 'Test 2.5a: null returns false');
assertEquals(isLoginPage(undefined), false, 'Test 2.5b: undefined returns false');
assertEquals(isLoginPage(''), false, 'Test 2.5c: empty string returns false');
assertEquals(isLoginPage(123), false, 'Test 2.5d: non-string returns false');

// Test Suite 3: Real-world scenarios from issue
console.log('\n📋 Test Suite 3: Real-World Scenarios\n');

// Test 3.1: Login page with password reset text (from issue description)
console.log('Test 3.1: Login page with password reset text');
const issueLoginPageHtml = `
<html>
  <head><title>AISIS Login</title></head>
  <body>
    <h1>Sign in</h1>
    <form action="login.do" method="POST">
      <label>Username:</label>
      <input name="userName" />
      <label>Password:</label>
      <input name="password" type="password" />
      <button>Sign in</button>
    </form>
    <p>Forgot your password? Request a password reset by sending an email to itsupport@ateneo.edu</p>
  </body>
</html>
`;
assertEquals(isLoginPage(issueLoginPageHtml), true, 'Test 3.1: Issue-style login page detected');

// Test 3.2: HTML that looks like scraped login page content (subject_code contains login text)
console.log('\nTest 3.2: Malformed schedule with login page content');
// This simulates what happens when login page is mistakenly parsed as schedule data
const malformedScheduleHtml = `
<html>
  <body>
    <table>
      <tr>
        <td class="text02">Sign in... Username:... Password:...</td>
        <td class="text02">Sign in... Forgot your password? Request a password reset by sending an email to itsupport@ateneo.edu...</td>
      </tr>
    </table>
  </body>
</html>
`;
assertEquals(isLoginPage(malformedScheduleHtml), true, 'Test 3.2: Malformed schedule with login content detected');

// Test 3.3: Valid INTAC schedule page
console.log('\nTest 3.3: Valid INTAC schedule page');
const validIntacHtml = `
<html>
  <head><title>Schedule of Classes - INTAC</title></head>
  <body>
    <h1>Schedule of Classes</h1>
    <table>
      <tr>
        <td class="text02">INTACT 11</td>
        <td class="text02">INT-ME2</td>
        <td class="text02">INTRODUCTION TO ATENEO CULTURE AND TRADITIONS 11</td>
        <td class="text02">1.0</td>
        <td class="text02">M 1300-1400</td>
        <td class="text02">F-AVR</td>
        <td class="text02">VIRAY, JUSTIN ANDREW M.</td>
        <td class="text02">40</td>
        <td class="text02">ENG</td>
        <td class="text02">U</td>
        <td class="text02">35</td>
        <td class="text02"></td>
        <td class="text02"></td>
        <td class="text02"></td>
      </tr>
    </table>
  </body>
</html>
`;
assertEquals(isLoginPage(validIntacHtml), false, 'Test 3.3: Valid INTAC schedule not detected as login');

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
