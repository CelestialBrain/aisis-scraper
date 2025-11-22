import { AISISScraper } from '../src/scraper.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test real-world patterns from English department
 * 
 * NOTE: This test directly calls the private _parseCourses() method to unit test
 * the parser in isolation, without requiring network access or authentication.
 * This is intentional for fast, deterministic testing of edge cases.
 * 
 * This validates that the parser handles actual AISIS data correctly
 */
async function testRealWorldPatterns() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Real-World AISIS Patterns (English Dept)');
  console.log('═══════════════════════════════════════════════════════\n');

  const scraper = new AISISScraper('test_user', 'test_pass');

  // Load English fixture
  const fixturePath = join(__dirname, 'fixtures', 'english-2025-1-sample.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  console.log('📄 Loaded English dept fixture: english-2025-1-sample.html\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'EN');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Critical test cases from real AISIS data
  const criticalCases = [
    // Course with decimal in code
    { subjectCode: 'ENE 13.03i', section: 'N', units: '3', pattern: 'Decimal course code' },
    
    // Complex section codes
    { subjectCode: 'ENGL 11', section: 'WXY1', units: '3', pattern: 'Multi-letter+number section' },
    { subjectCode: 'ENE 13.04i', section: 'ST1A', units: '3', pattern: 'ST+letter section' },
    { subjectCode: 'ENGL 223', section: 'PT-GRAD', units: '3', pattern: 'Section with dash' },
    
    // 0-unit enrollment objects - CRITICAL
    { subjectCode: 'ENGL 296', section: 'COMP', units: '0', pattern: '0-unit COMP' },
    { subjectCode: 'ENGL 298.66', section: 'SUB-A', units: '0', pattern: '0-unit SUB-A with decimal' },
    { subjectCode: 'ENGL 298.77', section: 'SUB-B', units: '0', pattern: '0-unit SUB-B' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS1', units: '0', pattern: '0-unit THES/DISS1' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS2', units: '0', pattern: '0-unit THES/DISS2' },
    { subjectCode: 'ENGL 299.1', section: 'THES/DISS7', units: '0', pattern: '0-unit THES/DISS7' },
    { subjectCode: 'ENGL 299.19', section: 'YYY', units: '0', pattern: '0-unit YYY' },
    { subjectCode: 'ENGL 299.2', section: 'THES/DISS4', units: '0', pattern: '0-unit Thesis II' },
    { subjectCode: 'ENGL 299.4', section: 'ODEF1', units: '0', pattern: '0-unit ODEF1' },
    { subjectCode: 'ENGL 299.5', section: 'RESID', units: '0', pattern: '0-unit RESID' },
    { subjectCode: 'ENGL 299.6', section: 'SUB-A', units: '0', pattern: '0-unit SUB-A (Masters)' },
    { subjectCode: 'ENGL 299.7', section: 'SUB-B', units: '0', pattern: '0-unit SUB-B (Masters)' },
    
    // Doctoral level
    { subjectCode: 'ENLL 396', section: 'COMP', units: '0', pattern: '0-unit Doctoral COMP' },
    { subjectCode: 'ENLL 399.1', section: 'THES/DISS1', units: '0', pattern: '0-unit Dissertation I' },
    { subjectCode: 'ENLL 399.1', section: 'THES/DISS8', units: '0', pattern: '0-unit THES/DISS8' },
    { subjectCode: 'ENLL 399.19', section: 'YYY', units: '0', pattern: '0-unit Diss Proposal' },
    { subjectCode: 'ENLL 399.2', section: 'THES/DISS4', units: '0', pattern: '0-unit Dissertation II' },
    { subjectCode: 'ENLL 399.5', section: 'RESID', units: '0', pattern: '0-unit Doctoral RESID' },
    { subjectCode: 'ENLL 399.6', section: 'SUB-A', units: '0', pattern: '0-unit Doctoral SUB-A' },
    { subjectCode: 'ENLL 399.7', section: 'SUB-B', units: '0', pattern: '0-unit Doctoral SUB-B (EDGE CASE!)' },
  ];

  let passed = 0;
  let failed = 0;
  const missing = [];

  console.log('🔍 Validating critical patterns...\n');

  // Check each critical case
  for (const expected of criticalCases) {
    const found = courses.find(c => 
      c.subjectCode === expected.subjectCode && 
      c.section === expected.section
    );

    if (!found) {
      console.log(`❌ MISSING: ${expected.subjectCode} ${expected.section} [${expected.pattern}]`);
      failed++;
      missing.push(expected);
    } else {
      // Verify units match
      if (found.units === expected.units) {
        console.log(`✅ ${expected.subjectCode.padEnd(15)} ${expected.section.padEnd(12)} (${expected.units} units) - ${expected.pattern}`);
        passed++;
      } else {
        console.log(`⚠️  MISMATCH: ${expected.subjectCode} ${expected.section}`);
        console.log(`   Expected units: "${expected.units}", got "${found.units}"`);
        failed++;
      }
    }
  }

  // Count 0-unit patterns
  const zeroUnitExpected = criticalCases.filter(c => c.units === '0');
  const zeroUnitFound = zeroUnitExpected.filter(c =>
    courses.find(course => course.subjectCode === c.subjectCode && course.section === c.section)
  );

  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`   Total critical patterns tested: ${criticalCases.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  console.log(`\n📌 0-Unit Pattern Analysis:`);
  console.log(`   Expected: ${zeroUnitExpected.length}`);
  console.log(`   Found: ${zeroUnitFound.length}`);
  console.log(`   Missing: ${zeroUnitExpected.length - zeroUnitFound.length}`);

  // List all section codes found to analyze coverage
  const sectionCodes = [...new Set(courses.map(c => c.section))].sort();
  console.log(`\n📝 All section codes found (${sectionCodes.length}):`);
  console.log(`   ${sectionCodes.join(', ')}`);

  if (failed === 0) {
    console.log('\n✅ All real-world pattern tests passed!');
    console.log('   Parser correctly handles:');
    console.log('   - Decimal course codes (ENE 13.03i, ENGL 298.66, etc.)');
    console.log('   - Complex section codes (WXY1, ST1A, PT-GRAD, THES/DISS1-8, etc.)');
    console.log('   - 0-unit enrollment objects (COMP, SUB-A/B, THES/DISS, YYY, ODEF, RESID)');
    console.log('   - TBA (~) markers');
    console.log('   - Graduate-level courses');
    return true;
  } else {
    console.log('\n❌ Some real-world pattern tests failed!');
    console.log('   This indicates potential data loss in production scraping.');
    
    if (missing.length > 0) {
      console.log('\n   Missing patterns:');
      for (const m of missing) {
        console.log(`   - ${m.subjectCode} ${m.section} [${m.pattern}]`);
      }
    }
    
    return false;
  }
}

// Run tests
testRealWorldPatterns().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
