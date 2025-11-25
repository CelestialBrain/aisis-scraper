import fs from 'fs';
import { AISISScraper } from '../src/scraper.js';

/**
 * Integration test for schedule scraper improvements
 * 
 * Tests:
 * 1. No-results detection works correctly
 * 2. Department discovery functionality
 * 3. Error handling and logging
 */

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Schedule Scraper Integration Tests');
console.log('═══════════════════════════════════════════════════════\n');

// Create a mock scraper instance for testing
const scraper = new AISISScraper('test_user', 'test_pass');

// Test 1: No-results detection
console.log('Test 1: No-results detection in _scrapeDepartment');
console.log('   Testing that explicit no-results message is detected...');

// Mock the _request method to return a no-results page
const originalRequest = scraper._request;
scraper._request = async (url, options) => {
  const noResultsHtml = fs.readFileSync('tests/fixtures/aisis-no-results.html', 'utf8');
  return {
    ok: true,
    text: async () => noResultsHtml
  };
};
scraper.loggedIn = true; // Fake login for testing

// This should return empty array and log the appropriate message
let courses;
try {
  courses = await scraper._scrapeDepartment('2025-1', 'SALT');
  if (courses.length === 0) {
    console.log('   ✅ Test 1 passed: No-results page returns empty array');
  } else {
    console.log(`   ❌ Test 1 failed: Expected 0 courses, got ${courses.length}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`   ❌ Test 1 failed with error: ${error.message}`);
  process.exit(1);
}

// Test 2: Normal page with courses
console.log('\nTest 2: Normal page with courses');
scraper._request = async (url, options) => {
  const normalHtml = fs.readFileSync('tests/fixtures/aisis-schedule-edge-cases.html', 'utf8');
  return {
    ok: true,
    text: async () => normalHtml
  };
};

try {
  courses = await scraper._scrapeDepartment('2025-1', 'ENGG');
  if (courses.length === 6) {
    console.log(`   ✅ Test 2 passed: Normal page returns ${courses.length} courses`);
  } else {
    console.log(`   ❌ Test 2 failed: Expected 6 courses, got ${courses.length}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`   ❌ Test 2 failed with error: ${error.message}`);
  process.exit(1);
}

// Test 3: Department discovery (mock)
console.log('\nTest 3: Department discovery functionality');
scraper._request = async (url, options) => {
  // Mock HTML with deptCode dropdown
  const mockHtml = `
    <html>
      <body>
        <select name="deptCode">
          <option value="ALL">All Departments</option>
          <option value="BIO">Biology</option>
          <option value="CH">Chemistry</option>
          <option value="EN">English</option>
        </select>
      </body>
    </html>
  `;
  return {
    ok: true,
    text: async () => mockHtml
  };
};

try {
  const departments = await scraper.getAvailableDepartments();
  if (departments.length === 3) { // Excludes "ALL"
    console.log(`   ✅ Test 3 passed: Found ${departments.length} departments (excluding ALL)`);
    console.log(`      Departments: ${departments.map(d => d.value).join(', ')}`);
  } else {
    console.log(`   ❌ Test 3 failed: Expected 3 departments, got ${departments.length}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`   ❌ Test 3 failed with error: ${error.message}`);
  process.exit(1);
}

// Test 4: Login page detection triggers re-auth and retry (success case)
console.log('\nTest 4: Login page detection triggers re-auth and retry (success case)');

// Track request count to return different responses
let requestCount = 0;
const loginPageHtml = fs.readFileSync('tests/fixtures/aisis-login-page.html', 'utf8');
const validScheduleHtml = fs.readFileSync('tests/fixtures/aisis-schedule-edge-cases.html', 'utf8');

scraper._request = async (url, options) => {
  requestCount++;
  // First request returns login page, second returns valid schedule
  if (requestCount === 1) {
    return {
      ok: true,
      text: async () => loginPageHtml
    };
  } else {
    return {
      ok: true,
      text: async () => validScheduleHtml
    };
  }
};

// Mock the login method to simulate successful re-authentication
let loginCalled = false;
const originalLogin = scraper.login;
scraper.login = async () => {
  loginCalled = true;
  scraper.loggedIn = true;
  return true;
};

requestCount = 0;
loginCalled = false;
scraper.loggedIn = true;

try {
  courses = await scraper._scrapeDepartment('2025-1', 'INTAC');
  if (courses.length === 6 && loginCalled) {
    console.log('   ✅ Test 4 passed: Re-auth triggered and retry succeeded');
    console.log(`      - Login was called: ${loginCalled}`);
    console.log(`      - Total requests: ${requestCount}`);
    console.log(`      - Courses returned: ${courses.length}`);
  } else if (!loginCalled) {
    console.log('   ❌ Test 4 failed: Re-auth was not triggered');
    process.exit(1);
  } else {
    console.log(`   ❌ Test 4 failed: Expected 6 courses, got ${courses.length}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`   ❌ Test 4 failed with error: ${error.message}`);
  process.exit(1);
}

// Test 5: Login page detection throws after max retries (failure case)
console.log('\nTest 5: Login page detection throws after max retries (failure case)');

requestCount = 0;
loginCalled = false;
scraper.loggedIn = true;

// Both requests return login page (simulating persistent auth failure)
scraper._request = async (url, options) => {
  requestCount++;
  return {
    ok: true,
    text: async () => loginPageHtml
  };
};

try {
  courses = await scraper._scrapeDepartment('2025-1', 'INTAC');
  console.log('   ❌ Test 5 failed: Expected error but got success');
  process.exit(1);
} catch (error) {
  if (error.message.includes('INTAC') && error.message.includes('login page')) {
    console.log('   ✅ Test 5 passed: Error thrown after persistent login page');
    console.log(`      - Error message: "${error.message}"`);
    console.log(`      - Login was called: ${loginCalled}`);
    console.log(`      - Total requests: ${requestCount}`);
  } else {
    console.log(`   ❌ Test 5 failed: Unexpected error message: ${error.message}`);
    process.exit(1);
  }
}

// Restore original methods
scraper._request = originalRequest;
scraper.login = originalLogin;

console.log('\n✅ All integration tests passed!');
console.log('\nNote: These are unit tests with mocked responses.');
console.log('Full integration testing requires actual AISIS credentials and access.');
