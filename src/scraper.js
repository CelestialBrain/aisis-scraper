import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';

// Use node-fetch directly instead of fetch-cookie
const { default: fetch } = await import('node-fetch');

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.cookieJar = new CookieJar();
    this.loggedIn = false;
  }

  async init() {
    console.log('🚀 Initializing AISIS Scraper...');
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
      
      // Store cookies from response
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        await this.cookieJar.setCookie(setCookie, url);
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
          'Referer': `${this.baseUrl}/j_aisis/login.do`
        }
      });

      const responseText = await loginResponse.text();
      
      // Check for successful login
      if (responseText.includes('User Identified As') || 
          responseText.includes('MY INDIVIDUAL PROGRAM OF STUDY') ||
          responseText.includes('Welcome')) {
        
        this.loggedIn = true;
        console.log('✅ Login successful');
        
        // Verify we have session cookies
        const cookies = await this.cookieJar.getCookies(this.baseUrl);
        console.log(`   🍪 Session cookies: ${cookies.length}`);
        
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
    const bytes = Buffer.alloc(10);
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
    if (html.includes('sign in') || html.includes('login.do')) {
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
