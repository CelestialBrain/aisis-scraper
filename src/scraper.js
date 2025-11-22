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

  async scrapeSchedule(term = '2024-2') {
    if (!this.loggedIn) {
      throw new Error('Not logged in');
    }

    console.log(`\n📅 Scraping schedule for term: ${term}`);
    
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
        
        // Continue with remaining departments
        for (let i = 1; i < departments.length; i++) {
          const dept = departments[i];
          console.log(`   📚 Scraping ${dept}...`);
          
          try {
            const courses = await this._scrapeDepartment(term, dept);
            if (courses && courses.length > 0) {
              allCourses.push(...courses);
              console.log(`   ✅ ${dept}: ${courses.length} courses`);
            } else {
              console.log(`   ⚠️  ${dept}: No courses found`);
            }
          } catch (error) {
            console.error(`   ❌ ${dept}: ${error.message}`);
          }
          
          await this._delay(1000);
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

  async _scrapeDepartment(term, deptCode) {
    const formData = new URLSearchParams();
    formData.append('command', 'displayResults');
    formData.append('applicablePeriod', term);
    formData.append('deptCode', deptCode);
    formData.append('subjCode', 'ALL');

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
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Check for session expiry
    if (LOGIN_FAILURE_MARKERS.some(marker => html.includes(marker))) {
      throw new Error('Session expired');
    }

    return this._parseCourses(html, deptCode);
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
}
