import { AISISScraper } from '../src/scraper.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test Economics department completeness with various edge cases
 * This serves as a regression test for data completeness issues
 */
async function testEconCompleteness() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Economics (ECON) Department Completeness');
  console.log('═══════════════════════════════════════════════════════\n');

  const scraper = new AISISScraper('test_user', 'test_pass');

  // Load ECON fixture
  const fixturePath = join(__dirname, 'fixtures', 'econ-2025-1-sample.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  console.log('📄 Loaded ECON fixture: econ-2025-1-sample.html\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'EC');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Expected course patterns to validate
  const expectedPatterns = [
    // Basic lecture sections
    { subjectCode: 'ECON 110', section: 'C', title: 'PRINCIPLES OF ECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 110', section: 'WX1', title: 'PRINCIPLES OF ECONOMICS', units: '3.0' },
    
    // Multiple sections
    { subjectCode: 'ECON 111', section: 'A', title: 'MICROECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 111', section: 'A1', title: 'MICROECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 111', section: 'B', title: 'MICROECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 111', section: 'K', title: 'MICROECONOMICS', units: '3.0' },
    
    // Courses with decimal numbers and ST sections
    { subjectCode: 'ECON 117.01', section: 'ST1', title: 'ECONOMETRICS LECTURE', units: '3.0' },
    { subjectCode: 'ECON 117.01', section: 'ST2', title: 'ECONOMETRICS LECTURE', units: '3.0' },
    
    // Lab sections with dashes (0-unit)
    { subjectCode: 'ECON 117.02', section: 'LAB1-VW', title: 'ECONOMETRICS LAB', units: '0' },
    { subjectCode: 'ECON 117.02', section: 'LAB2-VW', title: 'ECONOMETRICS LAB', units: '0' },
    
    // Graduate courses (200+ level)
    { subjectCode: 'ECON 201', section: 'A', title: 'ADVANCED MICROECONOMIC THEORY', units: '3.0' },
    { subjectCode: 'ECON 202', section: 'A', title: 'ADVANCED MACROECONOMIC THEORY', units: '3.0' },
    { subjectCode: 'ECON 205', section: 'A', title: 'DEVELOPMENT ECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 206', section: 'A', title: 'INTERNATIONAL ECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 259', section: 'A', title: 'RESEARCH METHODS IN ECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 271', section: 'A', title: 'GAME THEORY', units: '3.0' },
    { subjectCode: 'ECON 285.45', section: 'A', title: 'SPECIAL TOPICS IN APPLIED ECONOMICS', units: '3.0' },
    { subjectCode: 'ECON 292', section: 'A', title: 'MASTER\'S ESSAY', units: '3.0' },
    
    // 0-unit enrollment objects - CRITICAL TEST CASES
    { subjectCode: 'ECON 296', section: 'COMP', title: 'COMPREHENSIVE EXAMINATION', units: '0' },
    { subjectCode: 'ECON 299.1', section: 'THES/DISS1', title: 'MASTER\'S THESIS I', units: '0' },
    { subjectCode: 'ECON 299.2', section: 'THES/DISS2', title: 'MASTER\'S THESIS II', units: '0' },
    { subjectCode: 'ECON 299.3', section: 'THES/DISS3', title: 'MASTER\'S THESIS III', units: '0' },
    { subjectCode: 'ECON 299.19', section: 'TWPD', title: 'THESIS PROPOSAL DEFENSE', units: '0' },
    { subjectCode: 'ECON 399.1', section: 'THES/DISS1', title: 'DISSERTATION I', units: '0' },
    { subjectCode: 'ECON 399.2', section: 'THES/DISS2', title: 'DISSERTATION II', units: '0' },
    { subjectCode: 'ECON 399.19', section: 'TWPD', title: 'DISSERTATION PROPOSAL DEFENSE', units: '0' },
  ];

  let passed = 0;
  let failed = 0;
  const missing = [];

  console.log('🔍 Validating expected course patterns...\n');

  // Check each expected pattern
  for (const expected of expectedPatterns) {
    const found = courses.find(c => 
      c.subjectCode === expected.subjectCode && 
      c.section === expected.section
    );

    if (!found) {
      console.log(`❌ MISSING: ${expected.subjectCode} ${expected.section} - ${expected.title}`);
      failed++;
      missing.push(expected);
    } else {
      // Verify details match
      const titleMatch = found.title === expected.title;
      const unitsMatch = found.units === expected.units;
      
      if (titleMatch && unitsMatch) {
        console.log(`✅ Found: ${expected.subjectCode} ${expected.section} - ${expected.title} (${expected.units} units)`);
        passed++;
      } else {
        console.log(`⚠️  PARTIAL: ${expected.subjectCode} ${expected.section}`);
        if (!titleMatch) console.log(`   Title mismatch: expected "${expected.title}", got "${found.title}"`);
        if (!unitsMatch) console.log(`   Units mismatch: expected "${expected.units}", got "${found.units}"`);
        failed++;
      }
    }
  }

  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`   Total patterns tested: ${expectedPatterns.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  // Special focus on critical 0-unit patterns
  const zeroUnitPatterns = expectedPatterns.filter(p => p.units === '0');
  const zeroUnitFound = zeroUnitPatterns.filter(p => 
    courses.find(c => c.subjectCode === p.subjectCode && c.section === p.section)
  );
  
  console.log(`\n📌 Critical 0-Unit Patterns:`);
  console.log(`   Expected: ${zeroUnitPatterns.length}`);
  console.log(`   Found: ${zeroUnitFound.length}`);
  console.log(`   Missing: ${zeroUnitPatterns.length - zeroUnitFound.length}`);

  // Special focus on special section codes
  const specialSections = ['WX1', 'ST1', 'ST2', 'LAB1-VW', 'LAB2-VW', 'COMP', 'THES/DISS1', 'THES/DISS2', 'THES/DISS3', 'TWPD'];
  const specialSectionPatterns = expectedPatterns.filter(p => specialSections.includes(p.section));
  const specialSectionFound = specialSectionPatterns.filter(p =>
    courses.find(c => c.subjectCode === p.subjectCode && c.section === p.section)
  );
  
  console.log(`\n📌 Special Section Code Patterns:`);
  console.log(`   Expected: ${specialSectionPatterns.length}`);
  console.log(`   Found: ${specialSectionFound.length}`);
  console.log(`   Missing: ${specialSectionPatterns.length - specialSectionFound.length}`);

  if (failed === 0) {
    console.log('\n✅ All ECON completeness tests passed!');
    console.log('   Parser correctly handles:');
    console.log('   - Basic lecture sections');
    console.log('   - Special section codes (WX1, ST1, LAB1-VW, THES/DISS, etc.)');
    console.log('   - 0-unit courses');
    console.log('   - Graduate-level courses (200+)');
    console.log('   - Comprehensive exams, thesis, and dissertation enrollment');
    return true;
  } else {
    console.log('\n❌ Some ECON completeness tests failed!');
    console.log('   This indicates potential data loss in production scraping.');
    return false;
  }
}

// Run tests
testEconCompleteness().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
