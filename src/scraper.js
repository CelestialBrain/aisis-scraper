import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import crypto from 'crypto';
import { DEPARTMENTS, isHeaderLikeRecord, SAMPLE_INVALID_RECORDS_COUNT, getSubjectPrefix } from './constants.js';

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

// Login page detection markers
// These are characteristic patterns found in AISIS login page HTML
const LOGIN_PAGE_MARKERS = {
  // Primary markers - strong indicators of login page
  primary: [
    'Sign in',                    // Login button/header text
    'login.do',                   // Login form action URL
    'displayLogin.do'             // Login page URL
  ],
  // Secondary markers - found together with primary markers on login page
  secondary: [
    'Username:',                  // Username field label
    'Password:',                  // Password field label
    'Forgot your password?',      // Password reset link text
    'itsupport@ateneo.edu'        // IT support email on login page
  ]
};

// Minimum number of primary markers required for medium-confidence login page detection
// (when no secondary markers are present)
const MIN_PRIMARY_MARKERS_FOR_DETECTION = 2;

/**
 * Detect if HTML content is the AISIS login page instead of actual schedule data
 * 
 * This function checks for characteristic markers found on the AISIS login page.
 * It uses a combination of primary and secondary markers to reliably detect
 * when the scraper has been redirected to the login page due to session expiry.
 * 
 * The detection logic:
 * 1. If any primary marker is found AND at least one secondary marker is also found,
 *    the page is considered a login page (high confidence)
 * 2. If multiple primary markers are found (MIN_PRIMARY_MARKERS_FOR_DETECTION+), 
 *    the page is likely a login page
 * 
 * @param {string} html - HTML content to check
 * @returns {boolean} True if the HTML appears to be a login page
 */
export function isLoginPage(html) {
  if (!html || typeof html !== 'string') {
    return false;
  }
  
  // Convert to lowercase for case-insensitive matching
  const lowerHtml = html.toLowerCase();
  
  // Count matches for primary markers
  const primaryMatches = LOGIN_PAGE_MARKERS.primary.filter(
    marker => lowerHtml.includes(marker.toLowerCase())
  );
  
  // Count matches for secondary markers
  const secondaryMatches = LOGIN_PAGE_MARKERS.secondary.filter(
    marker => lowerHtml.includes(marker.toLowerCase())
  );
  
  // High confidence: primary + secondary marker
  if (primaryMatches.length > 0 && secondaryMatches.length > 0) {
    return true;
  }
  
  // Medium confidence: multiple primary markers
  if (primaryMatches.length >= MIN_PRIMARY_MARKERS_FOR_DETECTION) {
    return true;
  }
  
  return false;
}

// AISIS system error page marker
const AISIS_ERROR_PAGE_MARKER = 'Your Request Cannot Be Processed At This Time';

// Retry configuration for HTTP errors
const RETRY_CONFIG = {
  MAX_RETRIES: 1,
  RETRY_DELAY_MS: 2000
};

// Scrape behavior configuration for batched concurrent department scraping
// Optimized for performance while remaining polite to AISIS server
// Can be overridden via environment variables for fast mode or custom tuning
const DEFAULT_SCRAPE_CONFIG = {
  CONCURRENCY: 8,        // Number of departments to scrape in parallel per batch (increased from 5)
  BATCH_DELAY_MS: 500    // Delay in milliseconds between batches (reduced from 750ms)
};

// Get scrape configuration from environment variables or defaults
function getScrapeConfig() {
  const concurrencyEnv = parseInt(process.env.AISIS_CONCURRENCY, 10);
  const concurrency = isNaN(concurrencyEnv) ? DEFAULT_SCRAPE_CONFIG.CONCURRENCY : concurrencyEnv;
  
  const batchDelayEnv = parseInt(process.env.AISIS_BATCH_DELAY_MS, 10);
  const batchDelayMs = isNaN(batchDelayEnv) ? DEFAULT_SCRAPE_CONFIG.BATCH_DELAY_MS : batchDelayEnv;
  
  return {
    CONCURRENCY: Math.max(1, Math.min(concurrency, 50)), // Clamp between 1 and 50 (increased from 20)
    BATCH_DELAY_MS: Math.max(0, Math.min(batchDelayMs, 5000)) // Clamp between 0 and 5000ms
  };
}

// Department codes to exclude when parsing available departments from AISIS
// These are placeholder/special values that should not be scraped as departments
const EXCLUDED_DEPT_CODES = [
  'ALL',      // Special value for "All Departments" option in dropdown
  '',         // Empty values
  'NONE',     // Possible placeholder value
  'SELECT'    // Possible placeholder text
];

/**
 * Compare two AISIS term codes for sorting and filtering
 * 
 * Term codes follow the format YYYY-S where:
 * - YYYY is the academic year (e.g., 2024, 2025)
 * - S is the semester: 0 (Intersession), 1 (First Semester), 2 (Second Semester)
 * 
 * Comparison logic:
 * - Compare year first (numerically)
 * - If years are equal, compare semester (numerically)
 * 
 * @param {string} a - First term code (e.g., '2024-1')
 * @param {string} b - Second term code (e.g., '2025-0')
 * @returns {number} Negative if a<b, 0 if a==b, positive if a>b
 * 
 * @example
 * compareTermCodes('2024-1', '2024-2')  // returns -1 (2024-1 < 2024-2)
 * compareTermCodes('2024-2', '2025-0')  // returns -1 (2024-2 < 2025-0)
 * compareTermCodes('2025-1', '2025-1')  // returns 0  (equal)
 * compareTermCodes('2025-2', '2025-1')  // returns 1  (2025-2 > 2025-1)
 */
export function compareTermCodes(a, b) {
  // Parse term codes
  const parseTermCode = (termCode) => {
    const parts = termCode.split('-');
    if (parts.length !== 2) {
      throw new Error(`Invalid term code format: ${termCode}. Expected format: YYYY-S`);
    }
    const year = parseInt(parts[0], 10);
    const semester = parseInt(parts[1], 10);
    
    if (isNaN(year) || isNaN(semester)) {
      throw new Error(`Invalid term code: ${termCode}. Year and semester must be numbers`);
    }
    
    return { year, semester };
  };
  
  try {
    const termA = parseTermCode(a);
    const termB = parseTermCode(b);
    
    // Compare year first
    if (termA.year !== termB.year) {
      return termA.year - termB.year;
    }
    
    // If years are equal, compare semester
    return termA.semester - termB.semester;
  } catch (error) {
    console.warn(`Term comparison error: ${error.message}`);
    // Fallback to string comparison if parsing fails
    return a.localeCompare(b);
  }
}

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

  /**
   * Get available departments from AISIS Schedule of Classes page
   * 
   * Fetches the list of department options from the deptCode dropdown
   * on the Schedule of Classes page. This allows the scraper to adapt
   * to changes in AISIS department codes while maintaining a stable
   * canonical list for downstream consumers.
   * 
   * @returns {Promise<Array<{value: string, label: string}>>} Array of department options
   */
  async getAvailableDepartments() {
    if (!this.loggedIn) {
      throw new Error('Not logged in - cannot fetch available departments');
    }

    console.log('🔍 Fetching available departments from AISIS...');

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
        throw new Error('Session expired while fetching departments');
      }

      // Parse HTML to find deptCode select
      const $ = cheerio.load(html);
      const select = $('select[name="deptCode"]');

      if (select.length === 0) {
        throw new Error('Could not find deptCode select element on page');
      }

      const departments = [];
      select.find('option').each((_, option) => {
        const value = $(option).attr('value');
        const label = $(option).text().trim();
        
        // Skip excluded department codes (placeholders and special values)
        // See EXCLUDED_DEPT_CODES constant for the list of excluded values
        if (value && value.trim() !== '') {
          const upperValue = value.trim().toUpperCase();
          if (!EXCLUDED_DEPT_CODES.some(excluded => upperValue === excluded.toUpperCase())) {
            departments.push({
              value: value.trim(),
              label: label
            });
          }
        }
      });

      console.log(`   ✅ Found ${departments.length} available departments in AISIS`);
      return departments;

    } catch (error) {
      console.error(`   ❌ Failed to fetch available departments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available terms from AISIS Schedule of Classes page
   * 
   * Fetches the list of term options from the applicablePeriod dropdown
   * on the Schedule of Classes page. Terms are in format YYYY-S where
   * S = 0 (Intersession), 1 (First Semester), 2 (Second Semester).
   * 
   * Note: Options can appear multiple times in the dropdown, so we deduplicate by value.
   * 
   * @returns {Promise<Array<{value: string, label: string, selected: boolean}>>} Array of unique term options
   */
  async getAvailableTerms() {
    if (!this.loggedIn) {
      throw new Error('Not logged in - cannot fetch available terms');
    }

    console.log('🔍 Fetching available terms from AISIS...');

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
        throw new Error('Session expired while fetching terms');
      }

      // Parse HTML to find applicablePeriod select
      const $ = cheerio.load(html);
      const select = $('select[name="applicablePeriod"]');

      if (select.length === 0) {
        throw new Error('Could not find applicablePeriod select element on page');
      }

      // Use a Map to deduplicate by value while preserving order
      const termsMap = new Map();
      
      select.find('option').each((_, option) => {
        const value = $(option).attr('value');
        const label = $(option).text().trim();
        const selected = $(option).attr('selected') !== undefined;
        
        if (value && value.trim() !== '') {
          const trimmedValue = value.trim();
          // Only add if not already in map, or update if this one is selected
          if (!termsMap.has(trimmedValue) || selected) {
            termsMap.set(trimmedValue, {
              value: trimmedValue,
              label: label,
              selected: selected
            });
          }
        }
      });

      const terms = Array.from(termsMap.values());
      
      console.log(`   ✅ Found ${terms.length} unique terms in AISIS`);
      const selectedTerm = terms.find(t => t.selected);
      if (selectedTerm) {
        console.log(`   📌 Current term: ${selectedTerm.value} (${selectedTerm.label})`);
      }
      
      return terms;

    } catch (error) {
      console.error(`   ❌ Failed to fetch available terms: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scrape schedules for multiple terms
   * 
   * Calls scrapeSchedule for each term and aggregates results.
   * Preserves per-term metadata for downstream processing.
   * 
   * @param {Array<string>} terms - Array of term codes (e.g., ['2024-2', '2025-0', '2025-1'])
   * @returns {Promise<Array<{term: string, courses: Array, departments: Array}>>} Array of results per term
   */
  async scrapeMultipleTerms(terms) {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    if (!Array.isArray(terms) || terms.length === 0) {
      throw new Error('Terms must be a non-empty array');
    }

    console.log(`\n📅 Scraping ${terms.length} term(s): ${terms.join(', ')}`);
    
    const results = [];
    
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📅 Scraping term ${i + 1}/${terms.length}: ${term}`);
      console.log(`${'='.repeat(60)}`);
      
      try {
        const scrapeResult = await this.scrapeSchedule(term);
        results.push({
          term: term,
          ...scrapeResult
        });
        
        console.log(`   ✅ Completed scraping for term ${term}: ${scrapeResult.courses.length} courses`);
      } catch (error) {
        console.error(`   ❌ Failed to scrape term ${term}: ${error.message}`);
        // Continue with other terms even if one fails
        results.push({
          term: term,
          courses: [],
          departments: [],
          error: error.message
        });
      }
    }
    
    const totalCourses = results.reduce((sum, r) => sum + r.courses.length, 0);
    console.log(`\n✅ Multi-term scraping complete: ${totalCourses} total courses across ${terms.length} terms`);
    
    return results;
  }

  async scrapeSchedule(term = null) {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    // Helper function for formatting time
    const formatTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

    // Check for FAST_MODE and custom configuration
    const fastMode = process.env.FAST_MODE === 'true';
    const SCRAPE_CONFIG = getScrapeConfig();
    
    // Log active configuration
    if (fastMode || process.env.AISIS_CONCURRENCY || process.env.AISIS_BATCH_DELAY_MS) {
      console.log('\n⚡ Custom scraping configuration active:');
      if (fastMode) console.log('   🚀 FAST_MODE enabled');
      if (process.env.AISIS_CONCURRENCY) {
        console.log(`   📊 AISIS_CONCURRENCY: ${SCRAPE_CONFIG.CONCURRENCY} (default: ${DEFAULT_SCRAPE_CONFIG.CONCURRENCY})`);
      }
      if (process.env.AISIS_BATCH_DELAY_MS) {
        console.log(`   ⏱  AISIS_BATCH_DELAY_MS: ${SCRAPE_CONFIG.BATCH_DELAY_MS}ms (default: ${DEFAULT_SCRAPE_CONFIG.BATCH_DELAY_MS}ms)`);
      }
    }

    // Auto-detect term if not provided (skip in FAST_MODE if term is provided)
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
    
    // Fetch available departments from AISIS for flexible mapping
    // This allows us to adapt to AISIS changes while maintaining stable canonical list
    let availableDepartments = [];
    try {
      const deptFetchStart = Date.now();
      availableDepartments = await this.getAvailableDepartments();
      const deptFetchTime = Date.now() - deptFetchStart;
      console.log(`   ⏱  Department discovery: ${formatTime(deptFetchTime)}`);
    } catch (error) {
      console.warn(`   ⚠️  Could not fetch available departments: ${error.message}`);
      console.warn(`   Proceeding with canonical DEPARTMENTS list only`);
    }
    
    // Build a map of available department codes for quick lookup
    const availableDeptSet = new Set(availableDepartments.map(d => d.value));
    
    // Use dynamic departments from AISIS as the authoritative set to scrape
    // Falls back to canonical DEPARTMENTS list if AISIS fetch failed
    // This allows automatic discovery of new departments (e.g., IE, LCS)
    // Filter by AISIS_DEPARTMENTS env var if provided (for local/dev runs)
    let departments = availableDepartments.length > 0 
      ? availableDepartments.map(d => d.value)
      : DEPARTMENTS;
    // Store original list before filtering for logging
    const originalDepartments = departments;
    
    if (process.env.AISIS_DEPARTMENTS) {
      const requestedDepts = process.env.AISIS_DEPARTMENTS.split(',').map(d => d.trim()).filter(d => d);
      const validDepts = requestedDepts.filter(d => departments.includes(d));
      const invalidDepts = requestedDepts.filter(d => !departments.includes(d));
      
      if (invalidDepts.length > 0) {
        console.warn(`   ⚠️  Invalid departments in AISIS_DEPARTMENTS (not in current list): ${invalidDepts.join(', ')}`);
      }
      
      if (validDepts.length > 0) {
        departments = validDepts;
        console.log(`   🎯 AISIS_DEPARTMENTS filter active: scraping ${departments.length} of ${originalDepartments.length} departments`);
        console.log(`      Departments: ${departments.join(', ')}`);
      } else {
        console.warn(`   ⚠️  No valid departments in AISIS_DEPARTMENTS - using all ${originalDepartments.length} departments`);
      }
    }

    // Initialize indexed accumulator for deterministic ordering
    const perDeptCourses = new Array(departments.length).fill(null);
    
    // Track per-department status for summary report
    const departmentStatus = {};
    
    // Log which source was used for departments
    if (availableDepartments.length > 0) {
      console.log(`   ✅ Using ${departments.length} departments from AISIS dropdown (dynamic discovery)`);
      const newDepts = departments.filter(d => !DEPARTMENTS.includes(d));
      if (newDepts.length > 0) {
        console.log(`   🆕 New departments discovered: ${newDepts.join(', ')}`);
      }
    } else {
      console.log(`   ℹ️  Using ${departments.length} departments from fallback list (AISIS fetch failed)`);
    }
    
    // Log structured START message with finalized configuration
    console.log('\n📥 SCHEDULE SCRAPE START', {
      term,
      department_count: departments.length,
      mode: fastMode ? 'FAST_MODE' : 'STANDARD',
      concurrency: SCRAPE_CONFIG.CONCURRENCY,
      batch_delay_ms: SCRAPE_CONFIG.BATCH_DELAY_MS
    });
    
    // In FAST_MODE, skip the test department pass and go straight to batched scraping
    if (fastMode) {
      console.log('   ⚡ FAST_MODE: Skipping test department pass, proceeding directly to batch scraping');
      
      // Process all departments using batched concurrent scraping
      const totalBatches = Math.ceil(departments.length / SCRAPE_CONFIG.CONCURRENCY);
      
      for (let i = 0; i < departments.length; i += SCRAPE_CONFIG.CONCURRENCY) {
        const batch = departments.slice(i, i + SCRAPE_CONFIG.CONCURRENCY);
        const batchNum = Math.floor(i / SCRAPE_CONFIG.CONCURRENCY) + 1;
        
        console.log(`   📦 Processing batch ${batchNum}/${totalBatches} (${batch.join(', ')})...`);
        const batchStart = Date.now();
        
        // Scrape all departments in this batch concurrently with retry tracking
        const batchPromises = batch.map(async (dept, localIndex) => {
          const globalIndex = i + localIndex;
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
                return { globalIndex, courses };
              } else {
                // 0 courses returned - this is valid (no offerings or explicit no-results)
                // Detailed logging already happened in _scrapeDepartment
                departmentStatus[dept] = {
                  status: 'success_empty',
                  row_count: 0,
                  error: null,
                  attempts: attempt + 1
                };
                return { globalIndex, courses: [] };
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
          
          return { globalIndex, courses: [] };
        });
        
        // Wait for all departments in this batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Store results in indexed accumulator for deterministic ordering
        for (const { globalIndex, courses } of batchResults) {
          perDeptCourses[globalIndex] = courses || [];
        }
        
        const batchTime = Date.now() - batchStart;
        console.log(`   ⏱  Batch ${batchNum}: ${formatTime(batchTime)}`);
        
        // Add delay between batches (but not after the last batch)
        if (i + SCRAPE_CONFIG.CONCURRENCY < departments.length && SCRAPE_CONFIG.BATCH_DELAY_MS > 0) {
          await this._delay(SCRAPE_CONFIG.BATCH_DELAY_MS);
        }
      }
    } else {
      // Standard mode: Test with just 1 department first to verify session and term
      console.log('   🧪 Testing with first department...');
      const testDeptStart = Date.now();
      const testDept = departments[0];
    
      try {
        const testCourses = await this._scrapeDepartment(term, testDept);
        const testDeptTime = Date.now() - testDeptStart;
        console.log(`   ⏱  Test department: ${formatTime(testDeptTime)}`);
        
        if (testCourses && testCourses.length > 0) {
          console.log(`   ✅ Test successful: ${testCourses.length} courses found in ${testDept}`);
          perDeptCourses[0] = testCourses;
          departmentStatus[testDept] = {
            status: 'success',
            row_count: testCourses.length,
            error: null
          };
        } else {
          // 0 courses is valid (no offerings or explicit no-results)
          // Detailed logging already happened in _scrapeDepartment
          console.log(`   ✅ Test successful: ${testDept} has no courses for this term`);
          perDeptCourses[0] = [];
          departmentStatus[testDept] = {
            status: 'success_empty',
            row_count: 0,
            error: null
          };
        }
        
        // Continue with remaining departments using batched concurrent scraping
        const remainingDepts = departments.slice(1);
        const totalBatches = Math.ceil(remainingDepts.length / SCRAPE_CONFIG.CONCURRENCY);
        
        // Split remaining departments into batches for concurrent processing
        for (let i = 0; i < remainingDepts.length; i += SCRAPE_CONFIG.CONCURRENCY) {
          const batch = remainingDepts.slice(i, i + SCRAPE_CONFIG.CONCURRENCY);
          const batchNum = Math.floor(i / SCRAPE_CONFIG.CONCURRENCY) + 1;
          
          console.log(`   📦 Processing batch ${batchNum}/${totalBatches} (${batch.join(', ')})...`);
          const batchStart = Date.now();
          
          // Scrape all departments in this batch concurrently with retry tracking
          const batchPromises = batch.map(async (dept, localIndex) => {
            const globalIndex = i + 1 + localIndex; // +1 to skip test department
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
                  return { globalIndex, courses };
                } else {
                  // 0 courses returned - this is valid (no offerings or explicit no-results)
                  // Detailed logging already happened in _scrapeDepartment
                  departmentStatus[dept] = {
                    status: 'success_empty',
                    row_count: 0,
                    error: null,
                    attempts: attempt + 1
                  };
                  return { globalIndex, courses: [] };
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
            
            return { globalIndex, courses: [] };
          });
          
          // Wait for all departments in this batch to complete
          const batchResults = await Promise.all(batchPromises);
          
          // Store results in indexed accumulator for deterministic ordering
          for (const { globalIndex, courses } of batchResults) {
            perDeptCourses[globalIndex] = courses || [];
          }
          
          const batchTime = Date.now() - batchStart;
          console.log(`   ⏱  Batch ${batchNum}: ${formatTime(batchTime)}`);
          
          // Add delay between batches (but not after the last batch)
          if (i + SCRAPE_CONFIG.CONCURRENCY < remainingDepts.length && SCRAPE_CONFIG.BATCH_DELAY_MS > 0) {
            await this._delay(SCRAPE_CONFIG.BATCH_DELAY_MS);
          }
        }
      } catch (error) {
        console.error(`   💥 Test failed for ${testDept}:`, error.message);
        departmentStatus[testDept] = {
          status: 'failed',
          row_count: 0,
          error: error.message
        };
      }
    }

    // Flatten per-department courses into final ordered array
    const allCourses = [];
    for (const courseList of perDeptCourses) {
      if (courseList) allCourses.push(...courseList);
    }

    // Compute per-department subject prefix breakdown for diagnostics
    // This helps identify when specific subject families (like PEPC) drop to zero
    const debugMode = process.env.DEBUG_SCRAPER === 'true';
    const criticalDepts = ['PE', 'NSTP']; // Departments where missing subjects are critical
    
    if (debugMode || criticalDepts.some(dept => departments.includes(dept))) {
      console.log(`\n📊 Per-Department Subject Prefix Breakdown:`);
      
      for (let i = 0; i < departments.length; i++) {
        const dept = departments[i];
        const courseList = perDeptCourses[i] || [];
        
        if (courseList.length === 0) continue;
        
        // Compute subject prefix counts for this department
        const subjectPrefixCounts = {};
        for (const course of courseList) {
          const prefix = getSubjectPrefix(course.subjectCode);
          subjectPrefixCounts[prefix] = (subjectPrefixCounts[prefix] || 0) + 1;
        }
        
        // Log breakdown for critical departments or in debug mode
        if (debugMode || criticalDepts.includes(dept)) {
          const breakdown = Object.entries(subjectPrefixCounts)
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .map(([prefix, count]) => `${prefix}=${count}`)
            .join(', ');
          console.log(`   ${dept} (term ${term}): ${breakdown}`);
        }
      }
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
    
    // Print textual summary block (similar to curriculum)
    console.log(`\n   📊 Schedule Scraping Summary:`);
    console.log(`      Term: ${summary.term}`);
    console.log(`      Departments: ${summary.statistics.total_departments}`);
    console.log(`      Successful: ${summary.statistics.successful}`);
    console.log(`      Empty: ${summary.statistics.empty}`);
    console.log(`      Failed: ${summary.statistics.failed}`);
    console.log(`      Total courses: ${summary.total_courses}`);
    
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
    
    // Structured completion log for easier grepping and alignment with curriculum
    console.log('✅ SCHEDULE SCRAPE COMPLETE', {
      term: summary.term,
      total_departments: summary.statistics.total_departments,
      successful_departments: summary.statistics.successful,
      empty_departments: summary.statistics.empty,
      failed_departments: summary.statistics.failed,
      total_courses: summary.total_courses
    });
    
    // Build per-department result array for structured sync
    const departmentsArray = departments.map((dept, index) => ({
      department: dept,
      courses: perDeptCourses[index] || []
    }));
    
    // Return structured object with both flat courses (backward compat) and per-department grouping
    return {
      term: summary.term,
      courses: allCourses,
      departments: departmentsArray
    };
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
      
      // Check for login page detection (session expired or not authenticated)
      // This is more robust than the simple marker check - detects full login page HTML
      if (isLoginPage(html)) {
        console.error(`   🔒 [${deptCode}] Received AISIS login page HTML; session expired or not authenticated`);
        
        // Attempt re-authentication if we haven't retried yet
        if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`   🔄 [${deptCode}] Attempting re-authentication (attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES + 1})...`);
          
          // Mark as logged out and try to re-login
          this.loggedIn = false;
          const loginSuccess = await this.login();
          
          if (loginSuccess) {
            console.log(`   ✅ [${deptCode}] Re-authentication successful, retrying department scrape...`);
            await this._delay(RETRY_CONFIG.RETRY_DELAY_MS);
            return this._scrapeDepartment(term, deptCode, retryCount + 1);
          } else {
            throw new Error(`${deptCode} scrape failed: received AISIS login page instead of schedule; re-authentication failed`);
          }
        }
        
        // Max retries exceeded - fail fast with clear error
        throw new Error(`${deptCode} scrape failed: received AISIS login page instead of schedule after ${retryCount + 1} attempts`);
      }
      
      // Legacy check for session expiry (kept for backwards compatibility)
      // This catches simpler cases that might not be caught by isLoginPage
      // Note: This check is largely redundant now but kept for safety
      if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
        console.error(`   🔒 [${deptCode}] Session expiry detected via legacy markers`);
        
        // Apply same retry logic as isLoginPage detection for consistency
        if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`   🔄 [${deptCode}] Attempting re-authentication (attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES + 1})...`);
          this.loggedIn = false;
          const loginSuccess = await this.login();
          
          if (loginSuccess) {
            console.log(`   ✅ [${deptCode}] Re-authentication successful, retrying department scrape...`);
            await this._delay(RETRY_CONFIG.RETRY_DELAY_MS);
            return this._scrapeDepartment(term, deptCode, retryCount + 1);
          }
        }
        
        throw new Error(`${deptCode} scrape failed: session expired`);
      }

      // Check for explicit "no results" message from AISIS
      // This sentinel indicates that AISIS has no offerings for this department/term
      if (html.includes('Sorry. There are no results for your search criteria')) {
        console.log(`   ℹ️  ${deptCode}: No courses found for term ${term} (explicit AISIS no-results page)`);
        return [];
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
    
    /**
     * AISIS Schedule Table Structure Assumptions:
     * - Schedule data is in an HTML table with class 'needspadding'
     * - Each course row contains 14 cells (columns) with class 'text02'
     * - Column order: Subject Code, Section, Title, Units, Time, Room, Instructor,
     *   Max Slots, Language, Level, Free Slots, Remarks, S, P
     * - Header rows are also present but are filtered by isHeaderLikeRecord()
     * - We use 'table.needspadding td.text02' when available to avoid non-schedule cells,
     *   falling back to 'td.text02' for compatibility with older HTML or test fixtures
     */
    const CELLS_PER_ROW = 14;
    
    // Try tightened selector first (preferred for production), fall back to broader selector
    // This ensures we work with both real AISIS HTML and test fixtures
    let courseCells = $('table.needspadding td.text02');
    
    if (courseCells.length === 0) {
      // Fallback to broader selector for compatibility
      courseCells = $('td.text02');
    }
    
    if (courseCells.length === 0) {
      return courses;
    }

    const totalCells = courseCells.length;
    const expectedRows = Math.floor(totalCells / CELLS_PER_ROW);
    const remainder = totalCells % CELLS_PER_ROW;
    
    // Debug mode configuration
    const debugMode = process.env.DEBUG_SCRAPER === 'true';
    
    // Defensive logging: warn if cells don't align to CELLS_PER_ROW chunks
    if (remainder !== 0) {
      console.log(`   ⚠️  ${deptCode}: ${totalCells} cells found (expected multiple of ${CELLS_PER_ROW}). Remainder: ${remainder} cells.`);
      console.log(`   ℹ️  ${deptCode}: Processing ${expectedRows} complete rows, ${remainder} cells will be skipped.`);
      
      // In debug mode, show a sample of the first raw cell to help diagnose selector issues
      if (debugMode && courseCells.length > 0) {
        const firstCellText = $(courseCells[0]).text().trim();
        console.log(`   🔍 ${deptCode}: First raw cell text: "${firstCellText}"`);
      }
    }

    // Track invalid rows for debug logging
    const invalidRows = [];

    // Process in chunks of CELLS_PER_ROW cells per course
    let skippedRows = 0;
    let headerRows = 0;
    for (let i = 0; i < courseCells.length; i += CELLS_PER_ROW) {
      if (i + CELLS_PER_ROW - 1 >= courseCells.length) {
        // Not enough cells for a complete row - log and skip
        const remainingCells = courseCells.length - i;
        if (remainingCells > 0) {
          console.log(`   ⚠️  ${deptCode}: Skipping incomplete row at index ${i} (only ${remainingCells} cells remaining)`);
          skippedRows++;
        }
        break;
      }
      
      const cells = courseCells.slice(i, i + CELLS_PER_ROW);
      // Extract text from each cell, handling <br> tags by replacing them with spaces
      const cellTexts = cells.map((_, cell) => {
        const rawHtml = $(cell).html() || '';
        // First normalize <br> tags to spaces to preserve line breaks
        let text = rawHtml.replace(/<br\s*\/?>/gi, ' ');
        // Then strip all remaining HTML tags completely
        // Using a more comprehensive approach to handle nested and malformed tags
        while (/<[^>]+>/.test(text)) {
          text = text.replace(/<[^>]+>/g, '');
        }
        // Finally normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();
        return text;
      }).get();
      
      // Enhanced time parsing to preserve TBA and special markers
      // Note: <br> tags already normalized above, now just clean up modality markers
      let timeField = cellTexts[4];
      // Remove modality markers but preserve TBA and (~) for special courses
      timeField = timeField.replace(/\(FULLY ONSITE\)|\(FULLY ONLINE\)/g, '').trim();
      // Preserve (~) marker for special courses but remove empty ()
      timeField = timeField.replace(/\(\)\s*$/g, '').trim();
      
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
        remarks: this._cleanText(cellTexts[11] || ''),
        s: this._cleanText(cellTexts[12] || ''),
        p: this._cleanText(cellTexts[13] || '')
      };

      // Check for header/placeholder rows
      if (isHeaderLikeRecord(course)) {
        if (debugMode && headerRows < SAMPLE_INVALID_RECORDS_COUNT) {
          console.log(`   🔍 ${deptCode}: Header row detected at index ${i}:`, {
            subjectCode: course.subjectCode,
            section: course.section,
            title: course.title
          });
        }
        headerRows++;
        skippedRows++;
        continue;
      }

      // Validate required fields before adding
      if (!course.subjectCode || !course.subjectCode.trim()) {
        if (invalidRows.length < SAMPLE_INVALID_RECORDS_COUNT) {
          invalidRows.push({
            index: i,
            reason: 'missing subject code',
            data: { section: course.section, title: course.title }
          });
        }
        skippedRows++;
        continue;
      }

      courses.push(course);
    }

    // Summary logging
    if (headerRows > 0) {
      console.log(`   ℹ️  ${deptCode}: ${headerRows} header/placeholder row(s) filtered`);
    }
    if (invalidRows.length > 0) {
      console.log(`   ⚠️  ${deptCode}: ${skippedRows - headerRows} invalid row(s) skipped (sample shown)`);
      invalidRows.forEach(({ index, reason, data }) => {
        console.log(`      - Row ${index}: ${reason} - ${JSON.stringify(data)}`);
      });
    }

    // Debug logging: show sample of parsed courses and subject prefix breakdown
    if (debugMode && courses.length > 0) {
      const sampleSize = Math.min(3, courses.length);
      console.log(`   🔍 ${deptCode}: First ${sampleSize} parsed course(s):`);
      courses.slice(0, sampleSize).forEach(c => {
        console.log(`      - ${c.subjectCode} ${c.section}: ${c.title}`);
      });
    }
    
    // Compute per-subject prefix counts for diagnostic purposes
    // Subject prefix is the first "word" of subjectCode (e.g., "PEPC" from "PEPC 10", "NSTP" from "NSTP 11/CWTS")
    const subjectPrefixCounts = {};
    for (const course of courses) {
      const prefix = getSubjectPrefix(course.subjectCode);
      subjectPrefixCounts[prefix] = (subjectPrefixCounts[prefix] || 0) + 1;
    }
    
    // Log subject prefix breakdown in debug mode or always for critical departments
    const criticalDepts = ['PE', 'NSTP']; // Departments where missing subjects are critical
    if (debugMode || criticalDepts.includes(deptCode)) {
      if (Object.keys(subjectPrefixCounts).length > 0) {
        const breakdown = Object.entries(subjectPrefixCounts)
          .sort((a, b) => b[1] - a[1]) // Sort by count descending
          .map(([prefix, count]) => `${prefix}=${count}`)
          .join(', ');
        console.log(`   📊 ${deptCode}: Subject prefix breakdown: ${breakdown}`);
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
   * Scrape a single degree with validation and retry
   * 
   * This wrapper validates that AISIS returns HTML for the correct program
   * by checking the HTML program title against the requested degCode/label.
   * 
   * If validation fails (session bleed detected), it retries with exponential backoff.
   * After maxAttempts failures, it throws an error.
   * 
   * @param {string} degCode - Curriculum version identifier (e.g., 'BS CS_2024_1')
   * @param {string} label - Program label (e.g., 'BS Computer Science (2024-1)')
   * @param {number} maxAttempts - Maximum number of attempts (default: 3)
   * @returns {Promise<string>} Validated HTML for the curriculum
   * @throws {Error} If validation fails after all attempts
   */
  async _scrapeDegreeWithValidation(degCode, label, maxAttempts = 3) {
    // Import validation functions from curriculum-parser
    // Note: Dynamic import to avoid circular dependencies
    const { extractProgramTitle, isProgramMatch } = await import('./curriculum-parser.js');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Fetch HTML from AISIS
        const html = await this._scrapeDegree(degCode);
        
        // Check for AISIS system error page
        // Note: Using substring match for robustness - the key phrase is unlikely to change
        const isAisisErrorPage = html.includes(AISIS_ERROR_PAGE_MARKER);
        
        if (isAisisErrorPage) {
          if (attempt < maxAttempts) {
            // Retry with exponential backoff
            const backoffMs = 2000 * Math.pow(2, attempt - 1);
            // Use info level for first attempt, warning for subsequent
            const logFn = attempt === 1 ? console.log : console.warn;
            const icon = attempt === 1 ? 'ℹ️' : '⚠️';
            logFn(`   ${icon} ${degCode} (attempt ${attempt}/${maxAttempts}): AISIS returned system error page`);
            logFn(`      Retrying after ${backoffMs}ms...`);
            await this._delay(backoffMs);
            continue;
          } else {
            // All attempts returned error page - mark as unavailable
            console.error(`   ❌ ${degCode}: AISIS returned system error page ("${AISIS_ERROR_PAGE_MARKER}") on all ${maxAttempts} attempts. Marking curriculum as unavailable.`);
            throw new Error(`AISIS_ERROR_PAGE:${degCode}`);
          }
        }
        
        // Parse and validate program title
        const $ = cheerio.load(html);
        const programTitle = extractProgramTitle($) || label;
        
        // Validate that HTML matches requested program
        if (!isProgramMatch(degCode, label, programTitle)) {
          const errorMsg = `Validation failed for ${degCode} (attempt ${attempt}/${maxAttempts}): HTML contains "${programTitle}" but expected "${label}"`;
          
          if (attempt < maxAttempts) {
            // Retry with exponential backoff
            const backoffMs = 2000 * Math.pow(2, attempt - 1);
            // Use info level for first attempt, warning for subsequent
            const logFn = attempt === 1 ? console.log : console.warn;
            const icon = attempt === 1 ? 'ℹ️' : '⚠️';
            logFn(`   ${icon} ${errorMsg}`);
            logFn(`      Retrying after ${backoffMs}ms (AISIS session bleed suspected)...`);
            await this._delay(backoffMs);
            continue;
          } else {
            // Final attempt failed
            console.error(`   🚨 ${errorMsg}`);
            console.error(`      Maximum retry attempts exhausted - refusing to accept contaminated HTML`);
            throw new Error(`Curriculum HTML mismatch for ${degCode} after ${maxAttempts} attempts: got "${programTitle}"`);
          }
        }
        
        // Validation passed
        if (attempt > 1) {
          console.log(`   ✅ ${degCode}: Validation passed on attempt ${attempt}`);
        }
        return html;
        
      } catch (error) {
        // If error is AISIS error page, handle specially
        if (error.message.startsWith('AISIS_ERROR_PAGE:')) {
          throw error; // Propagate to mark as unavailable
        }
        
        // If error is NOT a validation failure, throw immediately (network errors, etc.)
        if (!error.message.includes('Curriculum HTML mismatch') && 
            !error.message.includes('Validation failed')) {
          throw error;
        }
        
        // If this was the last attempt and it's a validation error, re-throw
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // Otherwise, the validation failure will trigger retry in the next iteration
      }
    }
    
    // Should never reach here, but just in case
    throw new Error(`Failed to scrape ${degCode} after ${maxAttempts} attempts`);
  }

  /**
   * Scrape curriculum data for all degree programs
   * 
   * Uses the J_VOFC.do endpoint discovered through HAR file analysis.
   * This is an EXPERIMENTAL feature that depends on AISIS UI structure.
   * 
   * Supports filtering and limiting via environment variables:
   * - CURRICULUM_LIMIT: Take first N degree codes (e.g., "10" for first 10 programs)
   * - CURRICULUM_SAMPLE: Select specific degree codes (e.g., "BS CS_2024_1,BS ME_2023_1")
   * - CURRICULUM_DELAY_MS: Delay between requests (default: 1000ms, 500ms in FAST_MODE)
   *   ⚠️ WARNING: Very low delays (<500ms) increase risk of AISIS session bleed
   * - CURRICULUM_CONCURRENCY: Number of programs to scrape in parallel (default: 2, max: 10)
   *   ⚠️ WARNING: Very high concurrency (>4) increases risk of AISIS session bleed
   * 
   * Workflow:
   * 1. GET J_VOFC.do to retrieve list of curriculum versions (degCode dropdown)
   * 2. For each degCode, POST to J_VOFC.do to fetch curriculum HTML with validation
   * 3. Validate HTML matches requested program (circuit breaker for session bleed)
   * 4. Extract HTML and flatten to text format
   * 5. Return array of curriculum records with HTML and raw_text
   * 
   * The HTML can be parsed using src/curriculum-parser.js to extract structured course rows.
   * 
   * @returns {Promise<Array>} Array of curriculum records with { degCode, label, html, raw_text }
   */
  async scrapeCurriculum() {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    console.log('\n📚 Scraping Official Curriculum via J_VOFC.do...');
    console.log('   ⚠️ NOTE: Curriculum scraping is EXPERIMENTAL and UI-dependent');
    console.log('   This feature may break if AISIS changes the J_VOFC.do page structure.\n');

    // Check for FAST_MODE early to use in configuration
    const fastMode = process.env.FAST_MODE === 'true';

    // Parse environment variables for curriculum scraping control
    const curriculumLimitEnv = parseInt(process.env.CURRICULUM_LIMIT, 10);
    const curriculumLimit = isNaN(curriculumLimitEnv) ? null : curriculumLimitEnv;
    
    const curriculumSample = process.env.CURRICULUM_SAMPLE 
      ? process.env.CURRICULUM_SAMPLE.split(',').map(s => s.trim()).filter(s => s)
      : null;
    
    // Balanced defaults: Safe but not painfully slow
    // Fast mode uses 500ms (aggressive but tested)
    // Normal mode uses 1000ms (balanced - safer than aggressive, faster than ultra-conservative 2000ms)
    const defaultCurriculumDelay = fastMode ? 500 : 1000;
    const curriculumDelayEnv = parseInt(process.env.CURRICULUM_DELAY_MS, 10);
    const curriculumDelayMs = isNaN(curriculumDelayEnv) 
      ? defaultCurriculumDelay 
      : Math.max(0, curriculumDelayEnv);
    
    // Balanced defaults: Moderate parallelism for better performance
    // Concurrency 2 is well-tested and significantly faster than sequential (concurrency 1)
    // Still uses _scrapeDegreeWithValidation to prevent AISIS session bleed
    const defaultCurriculumConcurrency = 2;
    const curriculumConcurrencyEnv = parseInt(process.env.CURRICULUM_CONCURRENCY, 10);
    const curriculumConcurrency = isNaN(curriculumConcurrencyEnv) 
      ? defaultCurriculumConcurrency 
      : Math.max(1, Math.min(curriculumConcurrencyEnv, 10));
    
    // Log active configuration
    console.log('⚡ Curriculum scraping configuration:');
    if (fastMode) console.log('   🚀 FAST_MODE enabled');
    if (curriculumLimit) console.log(`   🔢 CURRICULUM_LIMIT: ${curriculumLimit}`);
    if (curriculumSample) console.log(`   🎯 CURRICULUM_SAMPLE: ${curriculumSample.length} specific programs`);
    
    // Show delay configuration with warnings
    if (process.env.CURRICULUM_DELAY_MS !== undefined) {
      console.log(`   ⏱  CURRICULUM_DELAY_MS: ${curriculumDelayMs}ms (override)`);
      if (curriculumDelayMs < 500) {
        console.warn(`      ⚠️  Very low delay may increase risk of AISIS session bleed`);
      }
    } else if (fastMode) {
      console.log(`   ⏱  CURRICULUM_DELAY_MS: ${curriculumDelayMs}ms (FAST_MODE)`);
    } else {
      console.log(`   ⏱  CURRICULUM_DELAY_MS: ${curriculumDelayMs}ms (default - balanced mode)`);
    }
    
    // Show concurrency configuration with warnings
    if (process.env.CURRICULUM_CONCURRENCY !== undefined) {
      console.log(`   📊 CURRICULUM_CONCURRENCY: ${curriculumConcurrency} (override, max: 10)`);
      if (curriculumConcurrency > 4) {
        console.warn(`      ⚠️  High concurrency (>4) may increase risk of AISIS session bleed`);
      }
    } else {
      console.log(`   📊 CURRICULUM_CONCURRENCY: ${curriculumConcurrency} (default - parallel scraping with validation)`);
    }
    console.log('');

    // Get list of all degree programs
    const allDegreePrograms = await this.getDegreePrograms();

    if (allDegreePrograms.length === 0) {
      console.warn('   ⚠️ No curriculum versions found - returning empty array');
      return [];
    }

    // Filter degree programs based on environment variables
    let degreePrograms = allDegreePrograms;
    
    // Apply sampling filter first (most specific)
    if (curriculumSample && curriculumSample.length > 0) {
      const sampleSet = new Set(curriculumSample);
      degreePrograms = allDegreePrograms.filter(p => sampleSet.has(p.degCode));
      
      const notFound = curriculumSample.filter(code => !allDegreePrograms.some(p => p.degCode === code));
      if (notFound.length > 0) {
        console.warn(`   ⚠️ CURRICULUM_SAMPLE: ${notFound.length} requested codes not found in AISIS:`);
        console.warn(`      ${notFound.join(', ')}`);
      }
      
      console.log(`   🎯 Filtered to ${degreePrograms.length} programs via CURRICULUM_SAMPLE`);
    }
    // Apply limit filter (less specific)
    else if (curriculumLimit && curriculumLimit > 0) {
      degreePrograms = allDegreePrograms.slice(0, curriculumLimit);
      console.log(`   🔢 Limited to first ${degreePrograms.length} programs via CURRICULUM_LIMIT`);
    }
    
    if (degreePrograms.length === 0) {
      console.warn('   ⚠️ No programs match filters - returning empty array');
      return [];
    }

    // Log structured START message with finalized configuration
    console.log('\n📥 CURRICULUM SCRAPE START', {
      total_available: allDegreePrograms.length,
      requested: degreePrograms.length,
      fast_mode: fastMode,
      concurrency: curriculumConcurrency,
      delay_ms: curriculumDelayMs
    });

    // Initialize indexed accumulator for deterministic ordering
    const allCurricula = new Array(degreePrograms.length).fill(null);
    let successCount = 0;
    let failureCount = 0;

    console.log(`   📖 Processing ${degreePrograms.length} of ${allDegreePrograms.length} curriculum versions...\n`);

    // Track progress for ETA calculation
    const startTime = Date.now();
    let lastProgressLog = startTime;
    const PROGRESS_LOG_INTERVAL_MS = 30000; // Log progress every 30 seconds

    // Helper function to log progress with ETA
    const logProgress = (index, total, force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressLog < PROGRESS_LOG_INTERVAL_MS) return;
      
      lastProgressLog = now;
      const elapsed = now - startTime;
      const rate = index / elapsed; // programs per ms
      const remaining = total - index;
      const etaMs = remaining / rate;
      const etaSec = Math.round(etaMs / 1000);
      
      console.log(`   📊 Progress: ${index}/${total} (${Math.round(index/total*100)}%) - ETA: ${etaSec}s`);
    };

    // Scrape degree programs with configurable concurrency
    if (curriculumConcurrency === 1) {
      // Sequential scraping (ultra-safe mode, opt-in via CURRICULUM_CONCURRENCY=1)
      console.log(`   🔒 Using sequential scraping (ultra-safe mode)`);
      for (let i = 0; i < degreePrograms.length; i++) {
        const { degCode, label } = degreePrograms[i];
        console.log(`   [${i + 1}/${degreePrograms.length}] Scraping ${degCode} (${label})...`);

        try {
          // Use validation wrapper to ensure HTML matches requested program
          const html = await this._scrapeDegreeWithValidation(degCode, label);
          const rawText = this._flattenCurriculumHtmlToText(html);

          allCurricula[i] = {
            degCode,
            label,
            html,          // Include HTML for structured parsing
            raw_text: rawText
          };

          successCount++;
          console.log(`   ✅ ${degCode}: ${html.length} characters HTML, ${rawText.length} characters text`);

          // Log periodic progress
          logProgress(i + 1, degreePrograms.length);

          // Polite delay between requests
          if (i < degreePrograms.length - 1 && curriculumDelayMs > 0) {
            await this._delay(curriculumDelayMs);
          }

        } catch (error) {
          // Special handling for AISIS error page - mark as unavailable
          if (error.message.startsWith('AISIS_ERROR_PAGE:')) {
            allCurricula[i] = {
              degCode,
              label,
              status: 'unavailable',
              reason: 'aisis_error_page',
              error: 'AISIS returned system error page on all attempts'
            };
            failureCount++;
          } else {
            failureCount++;
            console.error(`   ❌ ${degCode}: ${error.message}`);
          }
          // Continue with next curriculum instead of failing entirely
        }
      }
    } else {
      // Concurrent scraping with validation (balanced default mode)
      console.log(`   ⚡ Using concurrent scraping with concurrency ${curriculumConcurrency}`);
      console.log(`      ℹ️  All requests validated via _scrapeDegreeWithValidation to prevent session bleed`);
      
      for (let i = 0; i < degreePrograms.length; i += curriculumConcurrency) {
        const batch = degreePrograms.slice(i, i + curriculumConcurrency);
        const batchNum = Math.floor(i / curriculumConcurrency) + 1;
        const totalBatches = Math.ceil(degreePrograms.length / curriculumConcurrency);
        
        console.log(`   📦 Batch ${batchNum}/${totalBatches} (${batch.map(p => p.degCode).join(', ')})...`);
        
        const batchPromises = batch.map(async ({ degCode, label }, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            // Use validation wrapper even in concurrent mode
            const html = await this._scrapeDegreeWithValidation(degCode, label);
            const rawText = this._flattenCurriculumHtmlToText(html);
            
            console.log(`   ✅ [${globalIndex + 1}/${degreePrograms.length}] ${degCode}: ${html.length} chars HTML`);
            
            return {
              success: true,
              globalIndex,
              data: {
                degCode,
                label,
                html,
                raw_text: rawText
              }
            };
          } catch (error) {
            // Special handling for AISIS error page
            if (error.message.startsWith('AISIS_ERROR_PAGE:')) {
              return {
                success: false,
                globalIndex,
                isUnavailable: true,
                data: {
                  degCode,
                  label,
                  status: 'unavailable',
                  reason: 'aisis_error_page',
                  error: 'AISIS returned system error page on all attempts'
                }
              };
            } else {
              console.error(`   ❌ [${globalIndex + 1}/${degreePrograms.length}] ${degCode}: ${error.message}`);
              return {
                success: false,
                globalIndex,
                error: error.message
              };
            }
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Store results in indexed accumulator for deterministic ordering
        for (const result of batchResults) {
          if (result.success) {
            allCurricula[result.globalIndex] = result.data;
            successCount++;
          } else if (result.isUnavailable) {
            // Store unavailable curricula so they're tracked
            allCurricula[result.globalIndex] = result.data;
            failureCount++;
          } else {
            failureCount++;
          }
        }
        
        // Log periodic progress
        logProgress(i + batch.length, degreePrograms.length);
        
        // Delay between batches (but not after the last batch)
        if (i + curriculumConcurrency < degreePrograms.length && curriculumDelayMs > 0) {
          await this._delay(curriculumDelayMs);
        }
      }
    }

    // Force final progress log
    logProgress(degreePrograms.length, degreePrograms.length, true);

    // Filter out nulls to get final ordered curricula (preserves source order)
    const orderedCurricula = allCurricula.filter(Boolean);

    console.log(`\n   📊 Curriculum Scraping Summary:`);
    console.log(`      Total available: ${allDegreePrograms.length}`);
    console.log(`      Requested: ${degreePrograms.length}`);
    console.log(`      Successful: ${successCount}`);
    console.log(`      Failed: ${failureCount}`);
    const totalTime = Date.now() - startTime;
    console.log(`      Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`   📚 Total curriculum versions scraped: ${orderedCurricula.length}\n`);

    // Structured completion log for easier grepping and alignment with schedules
    console.log('✅ CURRICULUM SCRAPE COMPLETE', {
      total_available: allDegreePrograms.length,
      requested: degreePrograms.length,
      successful: successCount,
      failed: failureCount,
      total_scraped: orderedCurricula.length,
      duration_ms: totalTime
    });

    return orderedCurricula;
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
