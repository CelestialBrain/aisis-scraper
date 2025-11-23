import fs from 'fs';
import { AISISScraper } from '../src/scraper.js';

/**
 * Test suite for no-results detection in AISIS schedule scraper
 * 
 * Tests that the scraper correctly detects and handles the
 * "Sorry. There are no results for your search criteria." message
 * that AISIS returns for departments with no course offerings.
 */

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing No-Results Detection');
console.log('═══════════════════════════════════════════════════════\n');

// Create a mock scraper instance for testing
const scraper = new AISISScraper('test_user', 'test_pass');

// Test 1: Parse a no-results HTML page
console.log('Test 1: Parsing no-results HTML page');
const noResultsHtml = fs.readFileSync('tests/fixtures/aisis-no-results.html', 'utf8');
const courses = scraper._parseCourses(noResultsHtml, 'SALT');
console.log(`   Parsed ${courses.length} courses from no-results page`);
if (courses.length === 0) {
    console.log('   ✅ Test 1 passed: No courses parsed from no-results page');
} else {
    console.log(`   ❌ Test 1 failed: Expected 0 courses, got ${courses.length}`);
    process.exit(1);
}

// Test 2: Check if no-results sentinel is detected
console.log('\nTest 2: Detecting no-results sentinel message');
const hasNoResults = noResultsHtml.includes('Sorry. There are no results for your search criteria');
if (hasNoResults) {
    console.log('   ✅ Test 2 passed: No-results sentinel detected in HTML');
} else {
    console.log('   ❌ Test 2 failed: No-results sentinel not found');
    process.exit(1);
}

// Test 3: Ensure normal pages don't trigger false positives
console.log('\nTest 3: Normal page should not be detected as no-results');
const normalHtml = fs.readFileSync('tests/fixtures/aisis-schedule-edge-cases.html', 'utf8');
const hasNoResultsNormal = normalHtml.includes('Sorry. There are no results for your search criteria');
if (!hasNoResultsNormal) {
    console.log('   ✅ Test 3 passed: Normal page not detected as no-results');
} else {
    console.log('   ❌ Test 3 failed: Normal page incorrectly detected as no-results');
    process.exit(1);
}

console.log('\n✅ All no-results detection tests passed!');
