import fs from 'fs';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

// Create debug directory if it doesn't exist
if (!fs.existsSync('debug')) fs.mkdirSync('debug');

const jar = new CookieJar();
const fetchWithJar = fetchCookie(global.fetch, jar);

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.session = null;
    this.loggedIn = false;
  }

  async init() {
    console.log('🚀 Initializing AISIS Scraper...');
    this.session = fetchWithJar;
  }

  async _request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    const opts = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      signal: controller.signal,
      redirect: 'follow'
    };

    try {
      const response = await this.session(url, opts);
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
      // First, get the login page to establish session
      const getResponse = await this._request(`${this.baseUrl}/j_aisis/login.do`);
      const loginHtml = await getResponse.text();
      
      // Extract any required tokens from the login form if needed
      const $ = cheerio.load(loginHtml);
      const rnd = $('input[name="rnd"]').val() || this._generateRandom();
      
      const formData = new URLSearchParams();
      formData.append('userName', this.username);
      formData.append('password', this.password);
      formData.append('submit', 'Sign in');
      formData.append('command', 'login');
      formData.append('rnd', rnd);

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
      
      // Check if login was successful
      if (responseText.includes('User Identified As') || responseText.includes('MY INDIVIDUAL PROGRAM OF STUDY')) {
        this.loggedIn = true;
        console.log('✅ Login successful');
        
        // Save cookies for debugging
        const cookies = await jar.getCookies(this.baseUrl);
        fs.writeFileSync('debug/cookies.json', JSON.stringify(cookies, null, 2));
        
        return true;
      } else {
        console.error('❌ Login failed - incorrect credentials or system error');
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
    return 'r' + Array.from(crypto.getRandomValues(new Uint8Array(10)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async warmup() {
    console.log('🔥 Warming up session...');
    
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
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`
        }
      });

      const text = await response.text();
      
      if (response.ok && !text.includes('sign in') && !text.includes('login')) {
        console.log('✅ Session warmup successful');
        return true;
      } else {
        console.error('❌ Session warmup failed');
        return false;
      }
    } catch (error) {
      console.error('❌ Warmup error:', error.message);
      return false;
    }
  }

  async scrapeSchedule(term = '2024-2') {
    if (!this.loggedIn) {
      throw new Error('Not logged in. Call login() first.');
    }

    console.log(`📅 Scraping schedule for term: ${term}`);
    
    // Run warmup first
    if (!await this.warmup()) {
      throw new Error('Session warmup failed');
    }

    const departments = [
      "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", 
      "EC", "ECE", "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", 
      "HI", "SOHUM", "DISCS", "SALT", "INTAC", "IS", "JSP", "KSP", 
      "LAS", "MAL", "MA", "ML", "NSTP (ADAST)", "NSTP (OSCI)", 
      "PH", "PE", "PS", "POS", "PSY", "QMIT", "SB", "SOCSCI", 
      "SA", "TH", "TMP", "ITMGT", "MATH", "MIS", "CS", "HUM", 
      "LIT", "MGT", "MKT", "NF", "NS"
    ];

    const allCourses = [];
    
    for (const dept of departments) {
      console.log(`   📚 Scraping ${dept}...`);
      
      try {
        const courses = await this._scrapeDepartment(term, dept);
        if (courses && courses.length > 0) {
          allCourses.push(...courses);
          console.log(`   ✅ ${dept}: ${courses.length} courses`);
        } else {
          console.log(`   ⚠️  ${dept}: No courses found`);
        }
        
        // Rate limiting
        await this._delay(1000);
      } catch (error) {
        console.error(`   ❌ ${dept}: ${error.message}`);
        continue;
      }
    }

    console.log(`✅ Total courses scraped: ${allCourses.length}`);
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
    
    // Check if session is still valid
    if (html.includes('sign in') || html.includes('login.do')) {
      throw new Error('Session expired');
    }

    return this._parseCourses(html, deptCode);
  }

  _parseCourses(html, deptCode) {
    const $ = cheerio.load(html);
    const courses = [];
    
    // Find all course cells (similar to Python version)
    const courseCells = $('td.text02');
    console.log(`   DEBUG: Found ${courseCells.length} course cells for ${deptCode}`);
    
    if (courseCells.length === 0) {
      console.log(`   DEBUG: No course cells found for ${deptCode}`);
      // Save HTML for debugging
      fs.writeFileSync(`debug/${deptCode}_no_cells.html`, html.substring(0, 5000));
      return courses;
    }

    // Process in chunks of 14 cells per course (same as Python)
    for (let i = 0; i < courseCells.length; i += 14) {
      if (i + 13 >= courseCells.length) break;
      
      const cells = courseCells.slice(i, i + 14);
      const cellTexts = cells.map((_, cell) => $(cell).text().trim());
      
      const timeText = cellTexts[4];
      
      const course = {
        department: deptCode,
        subjectCode: this._cleanText(cellTexts[0]),
        section: this._cleanText(cellTexts[1]),
        title: this._cleanText(cellTexts[2]),
        units: this._cleanText(cellTexts[3]),
        time: this._cleanText(timeText).replace(/\(FULLY ONSITE\)|\(FULLY ONLINE\)|~|\(\)$/g, '').trim(),
        room: cellTexts[5].includes('TBA') ? 'TBA' : this._cleanText(cellTexts[5]),
        instructor: this._cleanText(cellTexts[6]),
        maxSlots: this._cleanText(cellTexts[7] || ''),
        language: this._cleanText(cellTexts[8] || ''),
        level: this._cleanText(cellTexts[9] || ''),
        freeSlots: this._cleanText(cellTexts[10] || ''),
        remarks: this._cleanText(cellTexts[11] || '')
      };

      // Only add if we have a valid course code
      if (course.subjectCode && !course.subjectCode.trim().match(/^\s*$/)) {
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
