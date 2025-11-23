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

// Restore original request method
scraper._request = originalRequest;

console.log('\n✅ All integration tests passed!');
console.log('\nNote: These are unit tests with mocked responses.');
console.log('Full integration testing requires actual AISIS credentials and access.');
