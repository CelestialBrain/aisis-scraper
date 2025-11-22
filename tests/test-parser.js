import { AISISScraper } from '../src/scraper.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test parser with edge cases from fixtures
 */
async function testParser() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing AISIS Schedule Parser');
  console.log('═══════════════════════════════════════════════════════\n');

  // Create a scraper instance (no login needed for parsing tests)
  const scraper = new AISISScraper('dummy', 'dummy');

  // Load fixture HTML
  const fixturePath = join(__dirname, 'fixtures', 'aisis-schedule-edge-cases.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  console.log('📄 Loaded test fixture: aisis-schedule-edge-cases.html\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'ENLL');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Expected courses
  const expected = [
    {
      subjectCode: 'ENGG 101',
      section: 'A',
      title: 'ENGINEERING MECHANICS',
      units: '3.0',
      time: 'MWF 10:00-11:00',
      room: 'SEC-A201'
    },
    {
      subjectCode: 'ENLL 399.6',
      section: 'SUB-A',
      title: 'COMPREHENSIVE EXAM (DOCTORAL)',
      units: '0',
      time: 'TBA (~)',  // Should preserve (~)
      room: 'TBA'
    },
    {
      subjectCode: 'ENLL 399.7',
      section: 'SUB-B',
      title: 'FINAL PAPER SUBMISSION (DOCTORAL)',
      units: '0',
      time: 'TBA (~)',  // The specific edge case!
      room: 'TBA'
    },
    {
      subjectCode: 'ENLL 399.5',
      section: 'SUB-C',
      title: 'RESIDENCY (DOCTORAL)',
      units: '0',
      time: 'TBA (~)',
      room: 'TBA'
    },
    {
      subjectCode: 'ENGG 202',
      section: 'B',
      title: 'DATA STRUCTURES',
      units: '3.0',
      time: 'T-TH 14:00-15:30',  // Should remove (FULLY ONLINE)
      room: 'ONLINE'
    },
    {
      subjectCode: 'ENGG 303',
      section: 'C',
      title: 'SOFTWARE ENGINEERING',
      units: '3.0',
      time: 'MWF 13:00-14:00',  // Should remove (FULLY ONSITE)
      room: 'SEC-B105'
    }
  ];

  // Verify each expected course
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const actual = courses[i];

    if (!actual) {
      console.log(`❌ Test ${i + 1}: Course not found - ${exp.subjectCode} ${exp.section}`);
      failed++;
      continue;
    }

    const tests = [
      { field: 'subjectCode', expected: exp.subjectCode, actual: actual.subjectCode },
      { field: 'section', expected: exp.section, actual: actual.section },
      { field: 'title', expected: exp.title, actual: actual.title },
      { field: 'units', expected: exp.units, actual: actual.units },
      { field: 'time', expected: exp.time, actual: actual.time },
      { field: 'room', expected: exp.room, actual: actual.room }
    ];

    let coursePass = true;
    for (const test of tests) {
      if (test.actual !== test.expected) {
        console.log(`❌ Test ${i + 1} (${exp.subjectCode} ${exp.section}): ${test.field}`);
        console.log(`   Expected: "${test.expected}"`);
        console.log(`   Actual:   "${test.actual}"`);
        coursePass = false;
      }
    }

    if (coursePass) {
      console.log(`✅ Test ${i + 1}: ${exp.subjectCode} ${exp.section} - ${exp.title}`);
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`   Total: ${expected.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ All tests passed!');
    return true;
  } else {
    console.log('\n❌ Some tests failed!');
    return false;
  }
}

// Run tests
testParser().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
