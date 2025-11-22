import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * AISIS Scraper - Direct Request Edition (Fast Mode)
 * Mimics browser behavior using HAR-derived headers and session management.
 */
export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.cookie = null;
    
    // Headers from your HAR file to mimic Chrome 142
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Origin': this.baseUrl,
      'Referer': `${this.baseUrl}/j_aisis/login.do`,
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1'
    };
  }

  async init() {
    console.log('🚀 Initializing Direct Request Engine (No Browser)...');
  }

  /**
   * Helper to handle requests and cookie persistence
   */
  async _request(url, options = {}) {
    const opts = {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
        'Cookie': this.cookie || ''
      },
      redirect: 'manual' // We handle redirects manually to capture cookies
    };

    const response = await fetch(url, opts);
    
    // Update cookie if server sends a new one
    const newCookie = response.headers.get('set-cookie');
    if (newCookie) {
      // Extract JSESSIONID
      const sessionPart = newCookie.split(';')[0];
      if (sessionPart) this.cookie = sessionPart;
    }

    return response;
  }

  async login() {
    console.log('🔐 Authenticating via Direct Request...');

    try {
      // 1. WARM-UP: Get initial session cookie (Crucial Step!)
      // This mimics the browser visiting the login page before submitting
      await this._request(`${this.baseUrl}/j_aisis/displayLogin.do`, { method: 'GET' });
      
      if (!this.cookie) console.warn('⚠️ Warning: No initial cookie received during warm-up.');

      // 2. LOGIN: Send credentials
      const params = new URLSearchParams();
      params.append('userName', this.username);
      params.append('password', this.password);
      params.append('submit', 'Sign in');
      params.append('command', 'login');
      // Random string logic from your HAR/Alexi's script
      params.append('rnd', 'r' + Math.random().toString(36).substring(7)); 

      const response = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      // Check success (Status 200 usually means "Welcome" page loaded directly, 302 means redirect)
      const text = await response.text();
      if (text.includes('Invalid password') || text.includes('Sign in')) {
        throw new Error('Authentication Failed: Invalid credentials.');
      }

      console.log('✅ Authentication Successful (Session Established)');
      
      // Human-like delay
      await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
      console.error('⛔ Critical Login Error:', error.message);
      throw error;
    }
  }

  async scrapeSchedule(fallbackTerm) {
    console.log('\n📅 Starting Schedule Extraction...');
    const results = [];

    try {
      // 1. Fetch form to get Term and Dept Codes
      // Referer must be login page or previous page
      this.headers['Referer'] = `${this.baseUrl}/j_aisis/login.do`;
      
      const initialResponse = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, { method: 'GET' });
      const initialHtml = await initialResponse.text();
      const $ = cheerio.load(initialHtml);

      // Auto-detect term
      let term = $('select[name="applicablePeriod"] option[selected]').val();
      if (!term) term = $('select[name="applicablePeriod"] option').first().val();
      
      if (!term || term === 'undefined') {
          console.warn(`   ⚠️ Auto-detection failed. Using fallback term: ${fallbackTerm}`);
          term = fallbackTerm;
      } else {
          console.log(`   ℹ️ Detected Term: ${term}`);
      }

      // Extract Departments
      let deptCodes = $('select[name="deptCode"] option')
        .map((i, el) => $(el).val())
        .get()
        .filter(val => val && val !== 'ALL');

      if (deptCodes.length === 0) {
        console.warn("   ⚠️ No departments found on page. Using fallback list.");
        deptCodes = ["ITMGT", "CS", "MIS", "DISCS", "MATH"]; // Add more as needed
      }

      console.log(`   Found ${deptCodes.length} departments to process.`);

      // 2. Loop through departments
      this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VCSC.do`; // Update Referer

      for (const dept of deptCodes) {
        const params = new URLSearchParams();
        params.append('command', 'displayResults');
        params.append('applicablePeriod', term);
        params.append('deptCode', dept);
        params.append('subjCode', 'ALL');

        try {
          const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });

          const html = await response.text();
          const $table = cheerio.load(html);
          let deptCount = 0;

          $table('table tr').each((i, row) => {
            const cells = $table(row).find('td');
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

  async scrapeCurriculum() {
    console.log('\n📚 Starting Curriculum Extraction...');
    const results = [];

    try {
      this.headers['Referer'] = `${this.baseUrl}/j_aisis/login.do`;
      const r1 = await this._request(`${this.baseUrl}/j_aisis/J_VOFC.do`, { method: 'GET' });
      const html = await r1.text();
      const $ = cheerio.load(html);

      const degrees = $('select[name="degCode"] option')
        .map((i, el) => $(el).val())
        .get()
        .filter(v => v);

      console.log(`   Found ${degrees.length} degree programs.`);
      this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VOFC.do`;

      // Limit to first 5 for testing, remove slice to scrape all
      for (const degree of degrees) { 
        const params = new URLSearchParams();
        params.append('degCode', degree); // Param from HAR

        const r2 = await this._request(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const pageHtml = await r2.text();
        const $p = cheerio.load(pageHtml);
        
        // Basic parser logic (adjust selectors if needed based on actual page structure)
        let year = '', sem = '';
        $p('table tr').each((i, row) => {
            const text = $p(row).text().toLowerCase();
            const cells = $p(row).find('td');

            // Context-aware parsing: Detects headers vs content rows
            if (text.includes('year')) year = $p(row).text().trim();
            else if (text.includes('semester')) sem = $p(row).text().trim();
            else if (cells.length >= 3) {
                results.push({
                    degree: degree,
                    yearLevel: year,
                    semester: sem,
                    courseCode: $p(cells[0]).text().trim(),
                    description: $p(cells[1]).text().trim(),
                    units: $p(cells[2]).text().trim(),
                    category: $p(cells[3]).text().trim() || ''
                });
            }
        });

        if (results.length > 0) console.log(`   ✓ ${degree}: Processed ${results.length} items`);
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (error) {
      console.error('   ❌ Curriculum Scrape Error:', error.message);
    }
    
    console.log(`✅ Official Curriculum complete: ${results.length} total items`);
    return results;
  }

  async close() {
    console.log('🔒 Direct Request Session Closed');
  }
}
