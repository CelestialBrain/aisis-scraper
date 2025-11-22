import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * AISIS Scraper - Direct Request Edition (Fast Mode)
 * Replaces Puppeteer with node-fetch + cheerio for speed and stability.
 */
export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.cookie = null; // Stores the session cookie (JSESSIONID)
  }

  /**
   * Placeholder to keep index.js happy.
   * No browser launch needed anymore.
   */
  async init() {
    console.log('🚀 Initializing Direct Request Engine (No Browser)...');
  }

  /**
   * Login using a direct POST request.
   * Extracts the JSESSIONID cookie from the response headers.
   */
  async login() {
    console.log('🔐 Authenticating via Direct Request...');
    
    const params = new URLSearchParams();
    params.append('userName', this.username);
    params.append('password', this.password);
    params.append('submit', 'Sign in');
    params.append('command', 'login');
    // Random "rnd" parameter to mimic browser behavior
    params.append('rnd', 'r' + Math.random().toString(36).substring(7)); 

    try {
      // Manual redirect allows us to inspect the 302 headers for the cookie
      const response = await fetch(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params,
        redirect: 'manual' 
      });

      const rawCookies = response.headers.get('set-cookie');
      if (!rawCookies) {
        // Fallback check: if status is 200, we might be on an error page or already logged in
        const text = await response.text();
        if (text.includes('Sign in')) throw new Error('Invalid credentials or login failed.');
        console.warn('⚠️ Warning: No cookie set, but proceeding...');
      } else {
        this.cookie = rawCookies.split(';')[0]; // Extract JSESSIONID
        console.log('✅ Authentication Successful (Session Cookie acquired)');
      }

    } catch (error) {
      console.error('⛔ Critical Login Error:', error.message);
      throw error;
    }
  }

  /**
   * Scrape Schedule using lightweight HTTP requests.
   * 1. GET the schedule page to find Department Codes.
   * 2. POST to get data for each department.
   */
  async scrapeSchedule() {
    console.log('\n📅 Starting Schedule Extraction (Fast Mode)...');
    const results = [];

    try {
      // 1. Fetch main page to get Department Codes and Term
      const initialResponse = await fetch(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        headers: { 'Cookie': this.cookie }
      });
      const initialHtml = await initialResponse.text();
      const $ = cheerio.load(initialHtml);

      // Extract current term automatically
      let term = $('select[name="applicablePeriod"] option[selected]').val();
      if (!term) term = $('select[name="applicablePeriod"] option').first().val();
      
      console.log(`   ℹ️ Detected Term: ${term}`);

      // Extract all Department Codes dynamically
      const deptCodes = $('select[name="deptCode"] option')
        .map((i, el) => $(el).val())
        .get()
        .filter(val => val && val !== 'ALL');

      console.log(`   Found ${deptCodes.length} departments to process.`);

      // 2. Loop through departments
      for (const dept of deptCodes) {
        const params = new URLSearchParams();
        params.append('command', 'displayResults');
        params.append('applicablePeriod', term);
        params.append('deptCode', dept);
        params.append('subjCode', 'ALL');

        try {
          const response = await fetch(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
            method: 'POST',
            headers: {
              'Cookie': this.cookie,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
          });

          const html = await response.text();
          const $table = cheerio.load(html);
          
          let deptCount = 0;

          // Parse table rows using Cheerio (jQuery-like syntax)
          $table('table tr').each((i, row) => {
            const cells = $table(row).find('td');
            // Valid rows usually have 12+ columns
            if (cells.length > 10) {
              results.push({
                department:  dept,
                subjectCode: $table(cells[0]).text().trim(),
                section:     $table(cells[1]).text().trim(),
                title:       $table(cells[2]).text().trim(),
                units:       $table(cells[3]).text().trim(),
                time:        $table(cells[4]).text().trim(),
                room:        $table(cells[5]).text().trim(),
                instructor:  $table(cells[6]).text().trim(),
                maxSlots:    $table(cells[7]).text().trim(),
                language:    $table(cells[8]).text().trim(),
                level:       $table(cells[9]).text().trim(),
                freeSlots:   $table(cells[10]).text().trim(),
                remarks:     $table(cells[11]).text().trim()
              });
              deptCount++;
            }
          });

          if (deptCount > 0) console.log(`   ✓ ${dept}: ${deptCount} classes`);
          
          // Tiny delay to be polite to the server
          await new Promise(r => setTimeout(r, 100)); 

        } catch (err) {
          console.error(`   ❌ Error fetching ${dept}:`, err.message);
        }
      }

    } catch (error) {
      console.error('   ❌ Schedule Scrape Error:', error.message);
    }

    console.log(`✅ Schedule extraction complete: ${results.length} total classes`);
    return results;
  }

  /**
   * Placeholder for Curriculum. 
   * Returns empty array to prevent index.js from crashing.
   */
  async scrapeCurriculum() {
    console.log('\n📚 Curriculum Extraction skipped in Fast Mode.');
    return []; 
  }

  async close() {
    console.log('🔒 Direct Request Session Closed');
  }
}
