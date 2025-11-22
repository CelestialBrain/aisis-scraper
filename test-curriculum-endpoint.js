/**
 * Test script to investigate AISIS curriculum endpoints
 */

import { AISISScraper } from './src/scraper.js';
import 'dotenv/config';

async function testEndpoints() {
  const { AISIS_USERNAME, AISIS_PASSWORD } = process.env;
  
  if (!AISIS_USERNAME || !AISIS_PASSWORD) {
    console.error('Missing credentials');
    process.exit(1);
  }

  const scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
  
  try {
    await scraper.init();
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      console.error('Login failed');
      process.exit(1);
    }

    console.log('\n=== Testing Curriculum Endpoints ===\n');

    // Test 1: Try GET request to J_VOPC.do (current approach with GET first)
    console.log('Test 1: GET request to J_VOPC.do');
    try {
      const response1 = await scraper._request(`${scraper.baseUrl}/j_aisis/J_VOPC.do`, {
        method: 'GET',
        headers: {
          'Referer': `${scraper.baseUrl}/j_aisis/J_VMCS.do`
        }
      });
      console.log(`  Status: ${response1.status}`);
      const text1 = await response1.text();
      console.log(`  Response length: ${text1.length}`);
      console.log(`  Contains form: ${text1.includes('<form')}`);
      console.log(`  Contains curriculum: ${text1.toLowerCase().includes('curriculum')}`);
      if (response1.status !== 404) {
        console.log(`  First 500 chars: ${text1.substring(0, 500)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }

    // Test 2: Try printCurriculum.do with GET
    console.log('\nTest 2: GET request to printCurriculum.do');
    try {
      const response2 = await scraper._request(`${scraper.baseUrl}/j_aisis/printCurriculum.do`, {
        method: 'GET'
      });
      console.log(`  Status: ${response2.status}`);
      const text2 = await response2.text();
      console.log(`  Response length: ${text2.length}`);
      if (response2.status !== 404) {
        console.log(`  First 500 chars: ${text2.substring(0, 500)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }

    // Test 3: Try printCurriculum.do with command=print
    console.log('\nTest 3: GET request to printCurriculum.do?command=print');
    try {
      const response3 = await scraper._request(`${scraper.baseUrl}/j_aisis/printCurriculum.do?command=print`, {
        method: 'GET'
      });
      console.log(`  Status: ${response3.status}`);
      const text3 = await response3.text();
      console.log(`  Response length: ${text3.length}`);
      if (response3.status !== 404) {
        console.log(`  First 500 chars: ${text3.substring(0, 500)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }

    // Test 4: Try J_VIPS.do (Individual Program of Study)
    console.log('\nTest 4: GET request to J_VIPS.do');
    try {
      const response4 = await scraper._request(`${scraper.baseUrl}/j_aisis/J_VIPS.do`, {
        method: 'GET'
      });
      console.log(`  Status: ${response4.status}`);
      const text4 = await response4.text();
      console.log(`  Response length: ${text4.length}`);
      console.log(`  Contains curriculum: ${text4.toLowerCase().includes('curriculum')}`);
      console.log(`  Contains program: ${text4.toLowerCase().includes('program')}`);
      if (response4.status !== 404) {
        console.log(`  First 500 chars: ${text4.substring(0, 500)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }

    // Test 5: List all available pages from main menu
    console.log('\nTest 5: GET main menu page to see available links');
    try {
      const response5 = await scraper._request(`${scraper.baseUrl}/j_aisis/J_VMCS.do`, {
        method: 'GET'
      });
      console.log(`  Status: ${response5.status}`);
      const text5 = await response5.text();
      
      // Extract all J_V*.do links
      const linkPattern = /j_aisis\/(J_V[A-Z]+\.do)/gi;
      const links = [...new Set(text5.match(linkPattern) || [])];
      console.log(`  Found ${links.length} unique J_V*.do endpoints:`);
      links.forEach(link => console.log(`    - ${link}`));
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }

    console.log('\n=== Test Complete ===\n');
    
  } catch (error) {
    console.error('Test error:', error.message);
    process.exit(1);
  }
}

testEndpoints();
