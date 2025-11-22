import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import crypto from 'crypto';

// Use node-fetch directly instead of fetch-cookie
const { default: fetch } = await import('node-fetch');

// Login/session validation patterns
const LOGIN_SUCCESS_MARKERS = [
  'User Identified As',
  'MY INDIVIDUAL PROGRAM OF STUDY',
  'Welcome'
];

const LOGIN_FAILURE_MARKERS = [
  'sign in',
  'login.do'
];

// Retry configuration for HTTP errors
const RETRY_CONFIG = {
  MAX_RETRIES: 1,
  RETRY_DELAY_MS: 2000
};

// Scrape behavior configuration for batched concurrent department scraping
const SCRAPE_CONFIG = {
  CONCURRENCY: 5,        // Number of departments to scrape in parallel per batch
  BATCH_DELAY_MS: 750    // Delay in milliseconds between batches of concurrent scrapes
};

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.cookieJar = new CookieJar();
    this.loggedIn = false;
    
    // Define the file path for saving cookies
    this.cookieFile = 'cookies.json';
  }

  async init() {
    console.log('🚀 Initializing AISIS Scraper...');
    // Try to load existing cookies on startup
    await this._loadCookies();
  }

  // Method to load cookies from file
  async _loadCookies() {
    if (fs.existsSync(this.cookieFile)) {
      try {
        const data = fs.readFileSync(this.cookieFile, 'utf8');
        const json = JSON.parse(data);
        // Reconstruct the jar from the saved JSON
        this.cookieJar = CookieJar.deserializeSync(json);
        this.loggedIn = true; // Assume logged in if cookies exist (validation happens in login())
        console.log('   📂 Loaded session from cookies.json');
      } catch (err) {
        console.error('   ⚠️ Error loading cookies:', err.message);
        // If error, start with fresh jar
        this.cookieJar = new CookieJar();
      }
    }
  }

  // Method to save cookies to file
  async _saveCookies() {
    try {
      // Serialize the entire jar to a JSON object
      const serialized = this.cookieJar.serializeSync();
      fs.writeFileSync(this.cookieFile, JSON.stringify(serialized, null, 2));
    } catch (err) {
      console.error('   ⚠️ Error saving cookies:', err.message);
    }
  }

  async _request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    // Get cookies for this domain
    const cookies = await this.cookieJar.getCookies(url);
    const cookieHeader = cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': cookieHeader
    };

    const opts = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      signal: controller.signal,
      redirect: 'manual' // Handle redirects manually
    };

    try {
      let response = await fetch(url, opts);
      
      // Store cookies from response - handle multiple Set-Cookie headers
      // node-fetch's headers.raw() returns an array for Set-Cookie
      let setCookies = [];
      if (response.headers.raw && typeof response.headers.raw === 'function') {
        const rawHeaders = response.headers.raw();
        if (rawHeaders['set-cookie']) {
          setCookies = rawHeaders['set-cookie'];
        }
      } else {
        // Fallback for compatibility
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          setCookies = [setCookie];
        }
      }
      
      // Process all cookies
      if (setCookies.length > 0) {
        for (const cookie of setCookies) {
          await this.cookieJar.setCookie(cookie, url);
        }
        // Save cookies immediately after receiving new ones
        await this._saveCookies();
      }

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, url).toString();
          return this._request(redirectUrl, { ...opts, redirect: 'manual' });
        }
      }

      return response;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Request timeout');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async login() {
    // If we already loaded cookies, try to validate the session first
    if (this.loggedIn) {
      console.log('   Testing existing session...');
      try {
        // Try to access a protected page to see if cookies are still valid
        const response = await this._request(`${this.baseUrl}/j_aisis/J_VMCS.do`);
        const text = await response.text();
        
        if (LOGIN_SUCCESS_MARKERS.some(marker => text.includes(marker))) {
            console.log('   ✅ Existing session is valid!');
            return true;
        } else {
            console.log('   ⚠️ Existing session expired. Re-logging in...');
            this.loggedIn = false;
        }
      } catch (e) {
        console.log('   ⚠️ Session validation failed. Re-logging in...');
        this.loggedIn = false;
      }
    }

    console.log('🔐 Logging into AISIS...');
    
    try {
      // Generate random token like Python version
      const rnd = this._generateRandom();

      const formData = new URLSearchParams();
      formData.append('userName', this.username);
      formData.append('password', this.password);
      formData.append('submit', 'Sign in');
      formData.append('command', 'login');
      formData.append('rnd', rnd);

      console.log('   📤 Sending login request...');
      const loginResponse = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/j_aisis/displayLogin.do`
        }
      });

      const responseText = await loginResponse.text();
      
      // Check for successful login markers in HTML
      if (LOGIN_SUCCESS_MARKERS.some(marker => responseText.includes(marker))) {
        
        console.log('   ✅ Login response contains success markers');
        
        // Force save after successful login
        await this._saveCookies();

        // Validation 1: Verify we have session cookies
        const cookies = await this.cookieJar.getCookies(this.baseUrl);
        console.log(`   🍪 Session cookies after login: ${cookies.length}`);
        
        if (cookies.length === 0) {
          console.error('❌ Login failed: no session cookies were set');
          return false;
        }
        
        // Validation 2: Test protected page to confirm session is valid
        console.log('   🔍 Verifying session with protected page...');
        try {
          const protectedPageUrl = new URL('/j_aisis/J_VMCS.do', this.baseUrl).toString();
          const testResponse = await this._request(protectedPageUrl);
          const testText = await testResponse.text();
          
          if (LOGIN_FAILURE_MARKERS.some(marker => testText.includes(marker))) {
            console.error('❌ Post-login protected page still shows login screen');
            return false;
          }
          
          if (LOGIN_SUCCESS_MARKERS.some(marker => testText.includes(marker))) {
            console.log('   ✅ Post-login protected page check passed');
          } else {
            console.warn('   ⚠️ Protected page validation inconclusive, proceeding anyway');
          }
        } catch (error) {
          console.error(`   ⚠️ Protected page check failed: ${error.message}`);
          console.error('   Proceeding with login anyway as cookies were set');
        }
        
        // All validations passed
        this.loggedIn = true;
        console.log('✅ Login successful');
        
        return true;
      } else {
        console.error('❌ Login failed');
        if (responseText.includes('Invalid') || responseText.includes('incorrect')) {
          throw new Error('Invalid username or password');
        }
        return false;
      }
    } catch (error) {
      console.error('⛔ Login error:', error.message);
      throw error;
    }
  }

  _generateRandom() {
    // Generate like Python: r + 20 hex chars from 10 random bytes
    const bytes = crypto.randomBytes(10);
    return 'r' + bytes.toString('hex');
  }

  /**
   * Auto-detect the current term from AISIS Schedule of Classes page
   * @returns {Promise<string>} The current term (e.g., '2025-1')
   */
  async _detectCurrentTerm() {
    if (!this.loggedIn) {
      throw new Error('Not logged in - cannot detect current term');
    }

    console.log('🔍 Auto-detecting current term from AISIS...');

    try {
      // GET the Schedule of Classes page
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'GET',
        headers: {
          'Referer': `${this.baseUrl}/j_aisis/J_VMCS.do`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load Schedule of Classes page: HTTP ${response.status}`);
      }

      const html = await response.text();

      // Check for session expiry
      if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
        throw new Error('Session expired while detecting current term');
      }

      // Parse HTML to find applicablePeriod select
      const $ = cheerio.load(html);
      const select = $('select[name="applicablePeriod"]');

      if (select.length === 0) {
        throw new Error('Could not find applicablePeriod select element on page');
      }

      // Try to find the selected option first
      let selectedOption = select.find('option[selected]');
      
      // If no option is explicitly selected, use the first option
      if (selectedOption.length === 0) {
        selectedOption = select.find('option').first();
        console.log('   ℹ️  No option explicitly selected, using first option as fallback');
      }

      if (selectedOption.length === 0) {
        throw new Error('No options found in applicablePeriod select');
      }

      const term = selectedOption.attr('value');
      const termText = selectedOption.text().trim();

      if (!term || term.trim() === '') {
        throw new Error('Selected option has no value attribute or is empty');
      }

      console.log(`   ✅ Detected term: ${term} (${termText})`);
      return term;

    } catch (error) {
      console.error(`   ❌ Failed to auto-detect term: ${error.message}`);
      throw error;
    }
  }

  async scrapeSchedule(term = null) {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    // Auto-detect term if not provided
    if (!term) {
      term = await this._detectCurrentTerm();
    }

    // Store the term being used for reference
    this.lastUsedTerm = term;

    console.log(`\n📅 Using applicablePeriod term: ${term}`);
    
    const departments = [
      "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", 
      "EC", "ECE", "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", 
      "HI", "SOHUM", "DISCS", "SALT", "INTAC", "IS", "JSP", "KSP", 
      "LAS", "MAL", "MA", "ML", "NSTP (ADAST)", "NSTP (OSCI)", 
      "PH", "PE", "PS", "POS", "PSY", "QMIT", "SB", "SOCSCI", 
      "SA", "TH", "TMP"
    ];

    const allCourses = [];
    
    // Test with just 1 department first
    console.log('   🧪 Testing with first department...');
    const testDept = departments[0];
    
    try {
      const testCourses = await this._scrapeDepartment(term, testDept);
      if (testCourses && testCourses.length > 0) {
        console.log(`   ✅ Test successful: ${testCourses.length} courses found in ${testDept}`);
        allCourses.push(...testCourses);
        
        // Continue with remaining departments using batched concurrent scraping
        const remainingDepts = departments.slice(1);
        const totalBatches = Math.ceil(remainingDepts.length / SCRAPE_CONFIG.CONCURRENCY);
        
        // Split remaining departments into batches for concurrent processing
        for (let i = 0; i < remainingDepts.length; i += SCRAPE_CONFIG.CONCURRENCY) {
          const batch = remainingDepts.slice(i, i + SCRAPE_CONFIG.CONCURRENCY);
          const batchNum = Math.floor(i / SCRAPE_CONFIG.CONCURRENCY) + 1;
          
          console.log(`   📦 Processing batch ${batchNum}/${totalBatches} (${batch.join(', ')})...`);
          
          // Scrape all departments in this batch concurrently
          const batchPromises = batch.map(async (dept) => {
            console.log(`   📚 Scraping ${dept}...`);
            
            try {
              const courses = await this._scrapeDepartment(term, dept);
              if (courses && courses.length > 0) {
                console.log(`   ✅ ${dept}: ${courses.length} courses`);
                return courses;
              } else {
                console.log(`   ⚠️  ${dept}: No courses found`);
                return [];
              }
            } catch (error) {
              console.error(`   ❌ ${dept}: ${error.message}`);
              return [];
            }
          });
          
          // Wait for all departments in this batch to complete
          const batchResults = await Promise.all(batchPromises);
          
          // Flatten and add all courses from this batch
          for (const courses of batchResults) {
            allCourses.push(...courses);
          }
          
          // Add delay between batches (but not after the last batch)
          if (i + SCRAPE_CONFIG.CONCURRENCY < remainingDepts.length) {
            await this._delay(SCRAPE_CONFIG.BATCH_DELAY_MS);
          }
        }
      } else {
        console.log('   ❌ Test failed - no courses found in first department');
      }
    } catch (error) {
      console.error(`   💥 Test failed for ${testDept}:`, error.message);
    }

    console.log(`\n📚 Total courses: ${allCourses.length}`);
    return allCourses;
  }

  async _scrapeDepartment(term, deptCode, retryCount = 0) {
    const formData = new URLSearchParams();
    formData.append('command', 'displayResults');
    formData.append('applicablePeriod', term);
    formData.append('deptCode', deptCode);
    formData.append('subjCode', 'ALL');

    try {
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`
        }
      });

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status} for dept ${deptCode}, term ${term}`;
        
        // Retry once on 5xx errors (server errors)
        if (response.status >= 500 && response.status < 600 && retryCount < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`   ⚠️  ${errorMsg} - retrying in ${RETRY_CONFIG.RETRY_DELAY_MS / 1000} seconds...`);
          await this._delay(RETRY_CONFIG.RETRY_DELAY_MS);
          return this._scrapeDepartment(term, deptCode, retryCount + 1);
        }
        
        throw new Error(errorMsg);
      }

      const html = await response.text();
      
      // Check for session expiry
      if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
        throw new Error('Session expired');
      }

      const courses = this._parseCourses(html, deptCode);
      
      // Log warning if no courses found
      if (courses.length === 0) {
        console.log(`   ⚠️  ${deptCode}: No courses found for term ${term}`);
      }
      
      return courses;
    } catch (error) {
      // Re-throw with more context if not already detailed
      if (!error.message.includes(deptCode)) {
        throw new Error(`${deptCode}: ${error.message}`);
      }
      throw error;
    }
  }

  _parseCourses(html, deptCode) {
    const $ = cheerio.load(html);
    const courses = [];
    
    // Look for course cells with class 'text02' (same as Python)
    const courseCells = $('td.text02');
    
    if (courseCells.length === 0) {
      return courses;
    }

    // Process in chunks of 14 cells per course
    for (let i = 0; i < courseCells.length; i += 14) {
      if (i + 13 >= courseCells.length) break;
      
      const cells = courseCells.slice(i, i + 14);
      const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();
      
      const course = {
        department: deptCode,
        subjectCode: this._cleanText(cellTexts[0]),
        section: this._cleanText(cellTexts[1]),
        title: this._cleanText(cellTexts[2]),
        units: this._cleanText(cellTexts[3]),
        time: this._cleanText(cellTexts[4]).replace(/\(FULLY ONSITE\)|\(FULLY ONLINE\)|~|\(\)$/g, '').trim(),
        room: cellTexts[5].includes('TBA') ? 'TBA' : this._cleanText(cellTexts[5]),
        instructor: this._cleanText(cellTexts[6]),
        maxSlots: this._cleanText(cellTexts[7] || ''),
        language: this._cleanText(cellTexts[8] || ''),
        level: this._cleanText(cellTexts[9] || ''),
        freeSlots: this._cleanText(cellTexts[10] || ''),
        remarks: this._cleanText(cellTexts[11] || '')
      };

      if (course.subjectCode && course.subjectCode.trim()) {
        courses.push(course);
      }
    }

    return courses;
  }

  _cleanText(text) {
    return text.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scrape curriculum data for all degree programs
   * 
   * NOTE: This feature is currently NOT SUPPORTED because the AISIS system
   * does not provide a public endpoint for scraping official curriculum data.
   * 
   * Background:
   * - The endpoint J_VOPC.do (View Official Program Curriculum) does not exist (returns 404)
   * - J_VIPS.do (View Individual Program of Study) is student-specific, not for all programs
   * - Official curricula are published as PDFs on ateneo.edu, not through AISIS API
   * 
   * Alternative solutions:
   * - Scrape curriculum from public Ateneo website curriculum pages
   * - Use manually curated curriculum data
   * - Access individual curriculum through J_VIPS.do (requires student context)
   * 
   * @returns {Promise<Array>} Array of curriculum records
   * @throws {Error} Always throws - curriculum scraping not supported
   */
  async scrapeCurriculum() {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    console.log('\n📚 Scraping Official Curriculum...');
    console.log('\n⚠️  CURRICULUM SCRAPING IS NOT SUPPORTED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('The AISIS system does not provide a public endpoint for');
    console.log('scraping official curriculum data for all degree programs.');
    console.log('');
    console.log('Why this doesn\'t work:');
    console.log('  • The J_VOPC.do endpoint returns HTTP 404 (does not exist)');
    console.log('  • J_VIPS.do is for individual student programs only');
    console.log('  • Official curricula are published as PDFs on ateneo.edu');
    console.log('');
    console.log('Alternative approaches:');
    console.log('  • Scrape from public Ateneo curriculum pages');
    console.log('  • Use manually curated curriculum JSON');
    console.log('  • Request API access from AISIS administrators');
    console.log('═══════════════════════════════════════════════════════\n');

    // Return empty array instead of throwing to allow workflow to complete
    return [];
  }

  async _scrapeDegreeProgram(degreeCode, retryCount = 0) {
    // IMPORTANT: The J_VOPC.do endpoint does not exist in AISIS.
    // Curriculum data is not publicly accessible through AISIS scraping.
    // See: https://github.com/CelestialBrain/aisis-scraper/issues/XXX
    // 
    // Alternative approaches:
    // 1. Use J_VIPS.do (Individual Program of Study) - but this is student-specific
    // 2. Scrape curriculum from public Ateneo website (non-AISIS)
    // 3. Use manually curated curriculum data
    //
    // For now, we return an informative error so users understand the limitation.
    
     throw new Error(`Curriculum scraping is not supported. The AISIS system does not provide a public endpoint for scraping official curriculum data for all degree programs. The endpoint J_VOPC.do returns HTTP 404. See documentation for alternative data sources.`);
  }
}
