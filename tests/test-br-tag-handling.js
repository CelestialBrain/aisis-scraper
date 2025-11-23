import { AISISScraper } from '../src/scraper.js';

/**
 * Test that <br> tag normalization in time cells works correctly
 */
async function testBrTagHandling() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing <br> Tag Normalization in Time Cells');
  console.log('═══════════════════════════════════════════════════════\n');

  const scraper = new AISISScraper('test_user', 'test_pass');

  // Test HTML with various <br> tag patterns as described in the problem statement
  const html = `
<html>
<body>
<table>
  <!-- Time with <br> and modality marker -->
  <tr>
    <td class="text02">ENGL 101</td>
    <td class="text02">A</td>
    <td class="text02">ENGLISH COMPOSITION</td>
    <td class="text02">3</td>
    <td class="text02">T-F 1400-1530<br>(FULLY ONSITE)</td>
    <td class="text02">SEC-A203</td>
    <td class="text02">SMITH, JOHN</td>
    <td class="text02">30</td>
    <td class="text02">ENG</td>
    <td class="text02">U</td>
    <td class="text02">5</td>
    <td class="text02">-</td>
    <td class="text02">N</td>
    <td class="text02">N</td>
  </tr>
  
  <!-- TBA with <br> and (~) marker -->
  <tr>
    <td class="text02">ENGL 299</td>
    <td class="text02">THES1</td>
    <td class="text02">THESIS</td>
    <td class="text02">0</td>
    <td class="text02">TBA<br>(~)</td>
    <td class="text02">TBA</td>
    <td class="text02">JONES, MARY</td>
    <td class="text02">10</td>
    <td class="text02">ENG</td>
    <td class="text02">G</td>
    <td class="text02">8</td>
    <td class="text02">-</td>
    <td class="text02">N</td>
    <td class="text02">N</td>
  </tr>
  
  <!-- TUTORIAL with <br> -->
  <tr>
    <td class="text02">ENGL 102</td>
    <td class="text02">B</td>
    <td class="text02">ADVANCED WRITING</td>
    <td class="text02">3</td>
    <td class="text02">TUTORIAL 0000-0000<br>(FULLY ONSITE)</td>
    <td class="text02">TBA</td>
    <td class="text02">BROWN, SUSAN</td>
    <td class="text02">15</td>
    <td class="text02">ENG</td>
    <td class="text02">U</td>
    <td class="text02">2</td>
    <td class="text02">-</td>
    <td class="text02">N</td>
    <td class="text02">N</td>
  </tr>
  
  <!-- Self-closing <br/> variant -->
  <tr>
    <td class="text02">ENGL 103</td>
    <td class="text02">C</td>
    <td class="text02">LITERATURE</td>
    <td class="text02">3</td>
    <td class="text02">MWF 1000-1100<br/>(FULLY ONLINE)</td>
    <td class="text02">ONLINE</td>
    <td class="text02">DAVIS, ROBERT</td>
    <td class="text02">25</td>
    <td class="text02">ENG</td>
    <td class="text02">U</td>
    <td class="text02">3</td>
    <td class="text02">-</td>
    <td class="text02">N</td>
    <td class="text02">N</td>
  </tr>
</table>
</body>
</html>
  `;

  console.log('📄 Testing HTML with various <br> tag patterns\n');

  // Parse courses
  const courses = scraper._parseCourses(html, 'EN');

  console.log(`📊 Parsed ${courses.length} courses\n`);

  // Expected results
  const expected = [
    {
      subjectCode: 'ENGL 101',
      section: 'A',
      time: 'T-F 1400-1530', // <br>(FULLY ONSITE) should be removed
      description: '<br> with (FULLY ONSITE)'
    },
    {
      subjectCode: 'ENGL 299',
      section: 'THES1',
      time: 'TBA (~)', // <br> should be replaced with space, (~) preserved
      description: 'TBA<br>(~)'
    },
    {
      subjectCode: 'ENGL 102',
      section: 'B',
      time: 'TUTORIAL 0000-0000', // <br>(FULLY ONSITE) should be removed
      description: 'TUTORIAL<br>(FULLY ONSITE)'
    },
    {
      subjectCode: 'ENGL 103',
      section: 'C',
      time: 'MWF 1000-1100', // <br/>(FULLY ONLINE) should be removed
      description: '<br/> variant with (FULLY ONLINE)'
    }
  ];

  let passed = 0;
  let failed = 0;

  console.log('🔍 Validating <br> tag normalization...\n');

  for (const exp of expected) {
    const actual = courses.find(c => c.subjectCode === exp.subjectCode && c.section === exp.section);
    
    if (!actual) {
      console.log(`❌ MISSING: ${exp.subjectCode} ${exp.section}`);
      failed++;
      continue;
    }
    
    if (actual.time === exp.time) {
      console.log(`✅ ${exp.subjectCode} ${exp.section}: "${actual.time}"`);
      console.log(`   Test case: ${exp.description}`);
      passed++;
    } else {
      console.log(`❌ ${exp.subjectCode} ${exp.section}:`);
      console.log(`   Expected: "${exp.time}"`);
      console.log(`   Actual:   "${actual.time}"`);
      console.log(`   Test case: ${exp.description}`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`   Total: ${expected.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ All <br> tag normalization tests passed!');
    console.log('   Parser correctly handles:');
    console.log('   - <br> tags replaced with spaces');
    console.log('   - <br/> self-closing variant');
    console.log('   - (FULLY ONSITE) and (FULLY ONLINE) markers removed');
    console.log('   - TBA (~) marker preserved after <br> normalization');
    return true;
  } else {
    console.log('\n❌ Some <br> tag tests failed!');
    return false;
  }
}

// Run test
testBrTagHandling().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
