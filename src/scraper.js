import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import crypto from 'crypto';
import { DEPARTMENTS } from './constants.js';

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

    // Helper function for formatting time
    const formatTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

    // Auto-detect term if not provided
    const termDetectStart = Date.now();
    if (!term) {
      term = await this._detectCurrentTerm();
      const termDetectTime = Date.now() - termDetectStart;
      console.log(`   ⏱  Term detection: ${formatTime(termDetectTime)}`);
    } else {
      console.log(`   ⏱  Term detection: 0.0s (skipped - using override)`);
    }

    // Store the term being used for reference
    this.lastUsedTerm = term;

    console.log(`\n📅 Using applicablePeriod term: ${term}`);
    
    const departments = DEPARTMENTS;

    const allCourses = [];
    
    // Track per-department status for summary report
    const departmentStatus = {};
    
    // Test with just 1 department first to verify session and term
    console.log('   🧪 Testing with first department...');
    const testDeptStart = Date.now();
    const testDept = departments[0];
    
    try {
      const testCourses = await this._scrapeDepartment(term, testDept);
      const testDeptTime = Date.now() - testDeptStart;
      console.log(`   ⏱  Test department: ${formatTime(testDeptTime)}`);
      
      if (testCourses && testCourses.length > 0) {
        console.log(`   ✅ Test successful: ${testCourses.length} courses found in ${testDept}`);
        allCourses.push(...testCourses);
        departmentStatus[testDept] = {
          status: 'success',
          row_count: testCourses.length,
          error: null
        };
        
        // Continue with remaining departments using batched concurrent scraping
        const remainingDepts = departments.slice(1);
        const totalBatches = Math.ceil(remainingDepts.length / SCRAPE_CONFIG.CONCURRENCY);
        
        // Split remaining departments into batches for concurrent processing
        for (let i = 0; i < remainingDepts.length; i += SCRAPE_CONFIG.CONCURRENCY) {
          const batch = remainingDepts.slice(i, i + SCRAPE_CONFIG.CONCURRENCY);
          const batchNum = Math.floor(i / SCRAPE_CONFIG.CONCURRENCY) + 1;
          
          console.log(`   📦 Processing batch ${batchNum}/${totalBatches} (${batch.join(', ')})...`);
          
          // Scrape all departments in this batch concurrently with retry tracking
          const batchPromises = batch.map(async (dept) => {
            console.log(`   📚 Scraping ${dept}...`);
            
            // Retry failed departments up to MAX_DEPT_RETRIES times
            const MAX_DEPT_RETRIES = 2;
            let lastError = null;
            
            for (let attempt = 0; attempt <= MAX_DEPT_RETRIES; attempt++) {
              try {
                const courses = await this._scrapeDepartment(term, dept);
                
                if (courses && courses.length > 0) {
                  console.log(`   ✅ ${dept}: ${courses.length} courses`);
                  departmentStatus[dept] = {
                    status: 'success',
                    row_count: courses.length,
                    error: null,
                    attempts: attempt + 1
                  };
                  return courses;
                } else {
                  // 0 courses - could be valid (no offerings) or error
                  console.log(`   ⚠️  ${dept}: No courses found`);
                  departmentStatus[dept] = {
                    status: 'success_empty',
                    row_count: 0,
                    error: null,
                    attempts: attempt + 1
                  };
                  return [];
                }
              } catch (error) {
                lastError = error;
                if (attempt < MAX_DEPT_RETRIES) {
                  const backoffMs = 1000 * Math.pow(2, attempt);
                  console.log(`   ⚠️  ${dept}: Retry ${attempt + 1}/${MAX_DEPT_RETRIES} after ${backoffMs}ms - ${error.message}`);
                  await this._delay(backoffMs);
                } else {
                  console.error(`   ❌ ${dept}: Failed after ${MAX_DEPT_RETRIES + 1} attempts - ${error.message}`);
                  departmentStatus[dept] = {
                    status: 'failed',
                    row_count: 0,
                    error: error.message,
                    attempts: attempt + 1
                  };
                }
              }
            }
            
            return [];
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
        departmentStatus[testDept] = {
          status: 'success_empty',
          row_count: 0,
          error: null
        };
      }
    } catch (error) {
      console.error(`   💥 Test failed for ${testDept}:`, error.message);
      departmentStatus[testDept] = {
        status: 'failed',
        row_count: 0,
        error: error.message
      };
    }

    // Generate summary and save to logs
    const summary = {
      term: term,
      timestamp: new Date().toISOString(),
      total_courses: allCourses.length,
      departments: departmentStatus,
      statistics: {
        total_departments: departments.length,
        successful: Object.values(departmentStatus).filter(d => d.status === 'success').length,
        empty: Object.values(departmentStatus).filter(d => d.status === 'success_empty').length,
        failed: Object.values(departmentStatus).filter(d => d.status === 'failed').length
      }
    };
    
    // Save summary to logs directory
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    const summaryPath = `logs/schedule_summary-${term}.json`;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\n📋 Scrape summary saved to ${summaryPath}`);
    
    // Print summary statistics
    console.log(`\n📊 Department Summary:`);
    console.log(`   Total departments: ${summary.statistics.total_departments}`);
    console.log(`   ✅ Successful: ${summary.statistics.successful}`);
    console.log(`   ℹ️  Empty (no courses): ${summary.statistics.empty}`);
    console.log(`   ❌ Failed: ${summary.statistics.failed}`);

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

      // Enhanced logging: count td.text02 cells before parsing
      const $ = cheerio.load(html);
      const cellCount = $('td.text02').length;
      
      const courses = this._parseCourses(html, deptCode);
      
      // Enhanced logging for data validation
      if (courses.length === 0) {
        if (cellCount === 0) {
          console.log(`   ℹ️  ${deptCode}: No courses found for term ${term} (0 data cells - likely no offerings)`);
        } else {
          console.log(`   ⚠️  ${deptCode}: Found ${cellCount} data cells but parsed 0 courses - possible HTML structure change or data issue`);
        }
      } else {
        const expectedCells = courses.length * 14;
        if (cellCount !== expectedCells) {
          console.log(`   ℹ️  ${deptCode}: ${courses.length} courses parsed from ${cellCount} cells (expected ${expectedCells})`);
        }
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

    const totalCells = courseCells.length;
    const expectedRows = Math.floor(totalCells / 14);
    const remainder = totalCells % 14;
    
    // Defensive logging: warn if cells don't align to 14-cell chunks
    if (remainder !== 0) {
      console.log(`   ⚠️  ${deptCode}: ${totalCells} cells found (expected multiple of 14). Remainder: ${remainder} cells.`);
      console.log(`   ℹ️  ${deptCode}: Processing ${expectedRows} complete rows, ${remainder} cells will be skipped.`);
    }

    // Process in chunks of 14 cells per course
    let skippedRows = 0;
    for (let i = 0; i < courseCells.length; i += 14) {
      if (i + 13 >= courseCells.length) {
        // Not enough cells for a complete row - log and skip
        const remainingCells = courseCells.length - i;
        if (remainingCells > 0) {
          console.log(`   ⚠️  ${deptCode}: Skipping incomplete row at index ${i} (only ${remainingCells} cells remaining)`);
          skippedRows++;
        }
        break;
      }
      
      const cells = courseCells.slice(i, i + 14);
      const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();
      
      // Enhanced time parsing to preserve TBA and special markers
      let timeField = this._cleanText(cellTexts[4]);
      // Remove modality markers but preserve TBA and (~) for special courses
      timeField = timeField.replace(/\(FULLY ONSITE\)|\(FULLY ONLINE\)/g, '').trim();
      // Preserve (~) marker for special courses but remove empty ()
      timeField = timeField.replace(/\(\)$/g, '').trim();
      
      const course = {
        department: deptCode,
        subjectCode: this._cleanText(cellTexts[0]),
        section: this._cleanText(cellTexts[1]),
        title: this._cleanText(cellTexts[2]),
        units: this._cleanText(cellTexts[3]),
        time: timeField,
        room: cellTexts[5].includes('TBA') ? 'TBA' : this._cleanText(cellTexts[5]),
        instructor: this._cleanText(cellTexts[6]),
        maxSlots: this._cleanText(cellTexts[7] || ''),
        language: this._cleanText(cellTexts[8] || ''),
        level: this._cleanText(cellTexts[9] || ''),
        freeSlots: this._cleanText(cellTexts[10] || ''),
        remarks: this._cleanText(cellTexts[11] || '')
      };

      // Validate required fields before adding
      if (!course.subjectCode || !course.subjectCode.trim()) {
        console.log(`   ⚠️  ${deptCode}: Skipped row at index ${i} - missing subject code`);
        skippedRows++;
        continue;
      }

      courses.push(course);
    }

    // Summary logging
    if (skippedRows > 0) {
      console.log(`   ⚠️  ${deptCode}: ${skippedRows} row(s) skipped due to incomplete or invalid data`);
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
   * Get all available degree programs (curriculum versions) from AISIS
   * 
   * Retrieves the list of curriculum versions from the J_VOFC.do page dropdown.
   * Each option represents a specific curriculum version (degree_year_semester).
   * 
   * @returns {Promise<Array>} Array of { degCode, label } objects
   */
  async getDegreePrograms() {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    console.log('   🔍 Fetching available curriculum versions...');

    try {
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
        method: 'GET',
        headers: {
          'Referer': `${this.baseUrl}/j_aisis/welcome.do`
        }
      });

      if (!response.ok) {
        console.warn(`   ⚠️ Failed to fetch degree programs: HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();

      // Check for session expiry
      if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
        throw new Error('Session expired while fetching degree programs');
      }

      const $ = cheerio.load(html);
      const select = $('select[name="degCode"]');

      if (select.length === 0) {
        console.warn('   ⚠️ Could not find degCode select element on J_VOFC.do page');
        return [];
      }

      const programs = [];
      select.find('option').each((_, option) => {
        const rawValue = $(option).attr('value');
        const rawText = $(option).text();
        
        if (rawValue) {
          const value = rawValue.trim();
          const text = rawText.trim();
          
          if (value !== '') {
            programs.push({
              degCode: value,
              label: text
            });
          }
        }
      });

      console.log(`   ✅ Found ${programs.length} curriculum versions`);
      return programs;

    } catch (error) {
      console.error(`   ❌ Error fetching degree programs: ${error.message}`);
      return [];
    }
  }

  /**
   * Scrape curriculum data for all degree programs
   * 
   * Uses the J_VOFC.do endpoint discovered through HAR file analysis.
   * This is an EXPERIMENTAL feature that depends on AISIS UI structure.
   * 
   * Workflow:
   * 1. GET J_VOFC.do to retrieve list of curriculum versions (degCode dropdown)
   * 2. For each degCode, POST to J_VOFC.do to fetch curriculum HTML
   * 3. Flatten curriculum HTML to text format for external parsing
   * 4. Return array of curriculum records with raw_text field
   * 
   * @returns {Promise<Array>} Array of curriculum records with { degCode, label, raw_text }
   */
  async scrapeCurriculum() {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    console.log('\n📚 Scraping Official Curriculum via J_VOFC.do...');
    console.log('   ⚠️ NOTE: Curriculum scraping is EXPERIMENTAL and UI-dependent');
    console.log('   This feature may break if AISIS changes the J_VOFC.do page structure.\n');

    // Get list of all degree programs
    const degreePrograms = await this.getDegreePrograms();

    if (degreePrograms.length === 0) {
      console.warn('   ⚠️ No curriculum versions found - returning empty array');
      return [];
    }

    const allCurricula = [];
    let successCount = 0;
    let failureCount = 0;

    console.log(`   📖 Processing ${degreePrograms.length} curriculum versions...\n`);

    // Scrape each degree program
    for (let i = 0; i < degreePrograms.length; i++) {
      const { degCode, label } = degreePrograms[i];
      console.log(`   [${i + 1}/${degreePrograms.length}] Scraping ${degCode} (${label})...`);

      try {
        const html = await this._scrapeDegree(degCode);
        const rawText = this._flattenCurriculumHtmlToText(html);

        allCurricula.push({
          degCode,
          label,
          raw_text: rawText
        });

        successCount++;
        console.log(`   ✅ ${degCode}: ${rawText.length} characters`);

        // Polite delay between requests
        if (i < degreePrograms.length - 1) {
          await this._delay(500);
        }

      } catch (error) {
        failureCount++;
        console.error(`   ❌ ${degCode}: ${error.message}`);
        // Continue with next curriculum instead of failing entirely
      }
    }

    console.log(`\n   📊 Curriculum Scraping Summary:`);
    console.log(`      Total versions: ${degreePrograms.length}`);
    console.log(`      Successful: ${successCount}`);
    console.log(`      Failed: ${failureCount}`);
    console.log(`   📚 Total curriculum versions scraped: ${allCurricula.length}\n`);

    return allCurricula;
  }

  /**
   * Scrape a single degree program curriculum by degCode
   * 
   * @param {string} degCode - Curriculum version identifier (e.g., 'BS CS_2024_1')
   * @param {number} retryCount - Current retry attempt (for internal use)
   * @returns {Promise<string>} Raw HTML of the curriculum page
   */
  async _scrapeDegree(degCode, retryCount = 0) {
    const formData = new URLSearchParams();
    formData.append('degCode', degCode);

    try {
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/j_aisis/J_VOFC.do`
        }
      });

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status} for degCode ${degCode}`;
        
        // Retry on 5xx errors (server errors)
        if (response.status >= 500 && response.status < 600 && retryCount < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`   ⚠️ ${errorMsg} - retrying in ${RETRY_CONFIG.RETRY_DELAY_MS / 1000} seconds...`);
          await this._delay(RETRY_CONFIG.RETRY_DELAY_MS);
          return this._scrapeDegree(degCode, retryCount + 1);
        }
        
        throw new Error(errorMsg);
      }

      const html = await response.text();

      // Check for session expiry
      if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
        throw new Error('Session expired while scraping curriculum');
      }

      return html;

    } catch (error) {
      // Re-throw with more context if not already detailed
      if (!error.message.includes(degCode)) {
        throw new Error(`${degCode}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Flatten curriculum HTML to text format
   * 
   * Extracts structured text from curriculum HTML page for external parsing.
   * Looks for headers (year/semester) and course rows in the table structure.
   * 
   * Note: This method uses heuristic selectors that may need adjustment if
   * AISIS changes the curriculum page HTML structure.
   * 
   * @param {string} html - Raw HTML from curriculum page
   * @returns {string} Flattened text representation of curriculum
   */
  _flattenCurriculumHtmlToText(html) {
    const $ = cheerio.load(html);
    const lines = [];

    // Extract page/program header if present
    // Note: Looking for common header patterns - may need adjustment
    const possibleHeaders = $('div.pageHeader, table:first tr:first td:first');
    const pageHeader = possibleHeaders.first().text().trim();
    if (pageHeader && pageHeader.length > 0 && pageHeader.length < 200) {
      lines.push(pageHeader);
      lines.push(''); // Blank line for separation
    }

    // Traverse all table rows
    $('tr').each((_, row) => {
      const $row = $(row);
      
      // Check if this row contains header cells (year/semester headers)
      const headerCells = $row.find('td.text04, th.text04');
      if (headerCells.length > 0) {
        const headerText = headerCells.map((_, cell) => $(cell).text().trim())
          .get()
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (headerText) {
          lines.push(headerText);
        }
        return; // Continue to next row
      }

      // Check if this row contains course/data cells
      // Note: Using multiple selectors for robustness, but may need updates if HTML changes
      const dataCells = $row.find('td.text02');
      if (dataCells.length > 0) {
        const cellTexts = dataCells.map((_, cell) => $(cell).text().trim())
          .get()
          .filter(text => text !== ''); // Filter out empty cells
        
        if (cellTexts.length > 0) {
          // Join with tabs for structured parsing
          lines.push(cellTexts.join('\t'));
        }
      }
    });

    return lines.join('\n').trim();
  }

  /**
   * @deprecated Use _scrapeDegree() instead
   * 
   * This method was designed for the non-existent J_VOPC.do endpoint.
   * The new curriculum scraper uses J_VOFC.do via _scrapeDegree().
   */
  async _scrapeDegreeProgram(degreeCode, retryCount = 0) {
    console.warn(`⚠️ _scrapeDegreeProgram() is deprecated - use _scrapeDegree() instead`);
    return [];
  }
}
