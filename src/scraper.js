import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

// Create debug directory if it doesn't exist
if (!fs.existsSync('debug')) fs.mkdirSync('debug');

const jar = new CookieJar();
// Use node-fetch if available, otherwise fall back to global fetch
let fetchWithJar;
try {
  const { default: nodeFetch } = await import('node-fetch');
  fetchWithJar = fetchCookie(nodeFetch, jar);
} catch (error) {
  fetchWithJar = fetchCookie(global.fetch, jar);
}

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.loggedIn = false;
  }

  async init() {
    console.log('🚀 Initializing AISIS Scraper...');
  }

  async _request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // Increased timeout
    
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Origin': this.baseUrl,
      'Referer': `${this.baseUrl}/j_aisis/login.do`
    };

    const opts = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      signal: controller.signal,
      redirect: 'manual' // Handle redirects manually to preserve cookies
    };

    try {
      let response = await fetchWithJar(url, opts);
      
      // Handle redirects manually to preserve session
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, this.baseUrl).toString();
          console.log(`   🔄 Following redirect to: ${redirectUrl}`);
          response = await fetchWithJar(redirectUrl, {
            ...opts,
            redirect: 'manual'
          });
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
    console.log('🔐 Logging into AISIS...');
    
    try {
      // First, get the login page to establish session and get any required tokens
      console.log('   📥 Loading login page...');
      const getResponse = await this._request(`${this.baseUrl}/j_aisis/login.do`);
      const loginHtml = await getResponse.text();
      
      // Extract any required tokens from the login form
      const $ = cheerio.load(loginHtml);
      let rnd = $('input[name="rnd"]').val();
      
      // If no rnd found in form, generate one like the Python script
      if (!rnd) {
        rnd = this._generateRandom();
        console.log(`   🔧 Generated rnd token: ${rnd.substring(0, 20)}...`);
      }

      const formData = new URLSearchParams();
      formData.append('userName', this.username);
      formData.append('password', this.password);
      formData.append('submit', 'Sign in');
      formData.append('command', 'login');
      formData.append('rnd', rnd);

      console.log('   📤 Sending login credentials...');
      const loginResponse = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.baseUrl}/j_aisis/login.do`
        }
      });

      const responseText = await loginResponse.text();
      const finalUrl = loginResponse.url;
      
      console.log(`   📍 Login response URL: ${finalUrl}`);
      console.log(`   📊 Login response status: ${loginResponse.status}`);
      
      // Check if login was successful using multiple indicators
      const successIndicators = [
        responseText.includes('User Identified As'),
        responseText.includes('MY INDIVIDUAL PROGRAM OF STUDY'),
        responseText.includes('Welcome'),
        finalUrl.includes('home.do'),
        finalUrl.includes('J_VMCS.do')
      ];

      if (successIndicators.some(indicator => indicator)) {
        this.loggedIn = true;
        console.log('✅ Login successful');
        
        // Save session info for debugging
        const cookies = await jar.getCookies(this.baseUrl);
        console.log(`   🍪 Session cookies: ${cookies.length}`);
        
        fs.writeFileSync('debug/login_success.html', responseText.substring(0, 5000));
        fs.writeFileSync('debug/cookies.json', JSON.stringify(cookies.map(c => ({
          key: c.key,
          value: c.value ? `${c.value.substring(0, 20)}...` : 'empty',
          domain: c.domain,
          path: c.path
        })), null, 2));
        
        return true;
      } else {
        console.error('❌ Login failed - incorrect credentials or system error');
        
        // Save debug info
        fs.writeFileSync('debug/login_failed.html', responseText);
        
        if (responseText.includes('Invalid') || responseText.includes('incorrect')) {
          throw new Error('Invalid username or password');
        }
        
        if (responseText.includes('sign in') || responseText.includes('login')) {
          throw new Error('Still on login page - authentication failed');
        }
        
        throw new Error('Unknown login failure');
      }
    } catch (error) {
      console.error('⛔ Login error:', error.message);
      throw error;
    }
  }

  _generateRandom() {
    // Generate random string like the Python script: r + 20 hex chars
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return 'r' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async warmup() {
    console.log('🔥 Warming up session before scraping...');
    
    const formData = new URLSearchParams();
    formData.append('command', 'displayResults');
    formData.append('applicablePeriod', '2024-2');
    formData.append('deptCode', 'IE');
    formData.append('subjCode', 'ALL');

    try {
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`
        }
      });

      const text = await response.text();
      
      // Check if we're still logged in
      if (response.ok && !text.includes('sign in') && !text.includes('login.do')) {
        console.log('✅ Session warmup successful');
        return true;
      } else {
        console.error('❌ Session warmup failed - session may have expired');
        this.loggedIn = false;
        return false;
      }
    } catch (error) {
      console.error('❌ Warmup error:', error.message);
      this.loggedIn = false;
      return false;
    }
  }

  async scrapeSchedule(term = '2024-2') {
    if (!this.loggedIn) {
      throw new Error('Not logged in. Call login() first.');
    }

    console.log(`\n📅 Scraping schedule for term: ${term}`);
    
    // Run warmup first to ensure session is active
    console.log('   🔄 Verifying session...');
    if (!await this.warmup()) {
      throw new Error('Session expired during warmup');
    }

    const departments = [
      "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", 
      "EC", "ECE", "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", 
      "HI", "SOHUM", "DISCS", "SALT", "INTAC", "IS", "JSP", "KSP", 
      "LAS", "MAL", "MA", "ML", "NSTP (ADAST)", "NSTP (OSCI)", 
      "PH", "PE", "PS", "POS", "PSY", "QMIT", "SB", "SOCSCI", 
      "SA", "TH", "TMP"
    ];

    const allCourses = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const dept of departments) {
      console.log(`   📚 Scraping ${dept}...`);
      
      try {
        const courses = await this._scrapeDepartment(term, dept);
        if (courses && courses.length > 0) {
          allCourses.push(...courses);
          successCount++;
          console.log(`   ✅ ${dept}: ${courses.length} courses`);
        } else {
          console.log(`   ⚠️  ${dept}: No courses found`);
          successCount++;
        }
        
        // Rate limiting - be more conservative
        await this._delay(1500);
      } catch (error) {
        console.error(`   ❌ ${dept}: ${error.message}`);
        failCount++;
        
        // If we're getting session errors, stop early
        if (error.message.includes('Session Expired') || error.message.includes('login page')) {
          console.error('   💥 Session expired, stopping scrape');
          break;
        }
        
        // Continue with other departments on other errors
        await this._delay(1000);
      }
    }

    console.log(`\n📊 Scraping Summary:`);
    console.log(`   ✅ Successful: ${successCount} departments`);
    console.log(`   ❌ Failed: ${failCount} departments`);
    console.log(`   📚 Total courses: ${allCourses.length}`);
    
    return allCourses;
  }

  async _scrapeDepartment(term, deptCode) {
    const formData = new URLSearchParams();
    formData.append('command', 'displayResults');
    formData.append('applicablePeriod', term);
    formData.append('deptCode', deptCode);
    formData.append('subjCode', 'ALL');

    // Debug: check cookies before request
    const cookiesBefore = await jar.getCookies(this.baseUrl);
    if (cookiesBefore.length === 0) {
      throw new Error('No session cookies available');
    }

    const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
      method: 'POST',
      body: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Save response for debugging
    fs.writeFileSync(`debug/${deptCode}_response.html`, html.substring(0, 10000));
    
    // Check if session is still valid
    if (html.includes('sign in') || html.includes('login.do') || html.includes('User Name:')) {
      this.loggedIn = false;
      throw new Error('Session Expired: login page returned');
    }

    // Check if we got a valid response with course data
    if (!html.includes('Subject') && !html.includes('Section') && !html.includes('Course')) {
      throw new Error('Unexpected page structure - no course data found');
    }

    return this._parseCourses(html, deptCode);
  }

  _parseCourses(html, deptCode) {
    const $ = cheerio.load(html);
    const courses = [];
    
    // Look for course tables - try multiple selectors
    let courseCells = $('td.text02');
    
    // If no cells found with that class, try other common patterns
    if (courseCells.length === 0) {
      courseCells = $('td').filter((i, elem) => {
        const text = $(elem).text().trim();
        return text && !text.includes('Subject') && !text.includes('Section') && text.length > 0;
      });
    }
    
    console.log(`   DEBUG: Found ${courseCells.length} potential course cells for ${deptCode}`);
    
    if (courseCells.length === 0) {
      console.log(`   DEBUG: No course cells found for ${deptCode}`);
      return courses;
    }

    // Process in chunks of 14 cells per course (same as Python)
    for (let i = 0; i < courseCells.length; i += 14) {
      if (i + 13 >= courseCells.length) break;
      
      const cells = courseCells.slice(i, i + 14);
      const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();
      
      const timeText = cellTexts[4];
      
      const course = {
        department: deptCode,
        subjectCode: this._cleanText(cellTexts[0]),
        section: this._cleanText(cellTexts[1]),
        title: this._cleanText(cellTexts[2]),
        units: this._cleanText(cellTexts[3]),
        time: this._cleanText(timeText).replace(/\(FULLY ONSITE\)|\(FULLY ONLINE\)|~|\(\)$/g, '').trim(),
        room: cellTexts[5] && cellTexts[5].includes('TBA') ? 'TBA' : this._cleanText(cellTexts[5]),
        instructor: this._cleanText(cellTexts[6]),
        maxSlots: this._cleanText(cellTexts[7] || ''),
        language: this._cleanText(cellTexts[8] || ''),
        level: this._cleanText(cellTexts[9] || ''),
        freeSlots: this._cleanText(cellTexts[10] || ''),
        remarks: this._cleanText(cellTexts[11] || '')
      };

      // Only add if we have a valid course code
      if (course.subjectCode && course.subjectCode.trim() && !course.subjectCode.match(/^\s*$/)) {
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
