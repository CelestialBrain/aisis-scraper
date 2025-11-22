import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.cookie = null;
    
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': this.baseUrl,
      'Referer': `${this.baseUrl}/j_aisis/login.do`,
      'Connection': 'keep-alive'
    };
  }

  async init() {
    console.log('🚀 Initializing Direct Request Engine...');
  }

  async _request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); 

    const opts = {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
        'Cookie': this.cookie || ''
      },
      redirect: 'manual',
      signal: controller.signal
    };

    try {
      const response = await fetch(url, opts);
      const newCookie = response.headers.get('set-cookie');
      if (newCookie) {
        const sessionPart = newCookie.split(';')[0];
        if (sessionPart) this.cookie = sessionPart;
      }
      return response;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request Timeout');
        throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async login() {
    console.log('🔐 Authenticating...');
    try {
      await this._request(`${this.baseUrl}/j_aisis/displayLogin.do`, { method: 'GET' });
      
      const params = new URLSearchParams();
      params.append('userName', this.username);
      params.append('password', this.password);
      params.append('submit', 'Sign in');
      params.append('command', 'login');
      params.append('rnd', 'r' + Math.random().toString(36).substring(7)); 

      const response = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params
      });

      const text = await response.text();
      // 🛑 ALEXI'S SUCCESS CHECK: Ensure the specific success text is present
      if (!text.includes('User Identified As')) { 
        throw new Error('❌ Authentication Failed: Server returned login page or generic error.');
      }
      
      console.log('✅ Authentication Successful');
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error('⛔ Critical Login Error:', error.message);
      throw error;
    }
  }

  async _getPayloadTerm() {
      try {
        const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, { method: 'GET' });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let term = $('select[name="applicablePeriod"] option[selected]').val();
        if (!term) term = $('select[name="applicablePeriod"] option').first().val();
        
        return term;
      } catch (e) {
          return null;
      }
  }

  async _scrapeDept(dept, term) {
    const params = new URLSearchParams();
    params.append('command', 'displayResults');
    params.append('applicablePeriod', term);
    params.append('deptCode', dept);
    params.append('subjCode', 'ALL');

    try {
      const response = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: params
      });

      const html = await response.text();
      
      // 🛑 SESSION LOSS CHECK: Throw error if we find the login page HTML
      if (html.includes('Sign in') && html.includes('Username:')) {
          throw new Error(`❌ Session Lost: Server returned login page when fetching ${dept}.`);
      }

      const $table = cheerio.load(html);
      const deptResults = [];

      $table('table tr').each((i, row) => {
        const cells = $table(row).find('td');
        if (cells.length > 10) {
          const col1 = $table(cells[0]).text().trim(); // Subject Code
          const col3 = $table(cells[2]).text().trim(); // Title
          const col4 = $table(cells[3]).text().trim(); // Units

          // 🛑 HEADER FILTER: Fixes the "1 class" bug
          if (
              /Subject Code|Cat\. No\.|Subject|Title|Units/i.test(col1) || 
              /Title/i.test(col3) ||
              /Units/i.test(col4) ||
              col1.includes('Ateneo Integrated') || 
              col1 === ''
          ) {
            return; 
          }

          deptResults.push({
            department:  dept,
            subjectCode: col1,
            section:     $table(cells[1]).text().trim(),
            title:       col3,
            units:       col4,
            time:        $table(cells[4]).text().trim(),
            room:        $table(cells[5]).text().trim(),
            instructor:  $table(cells[6]).text().trim(),
            maxSlots:    $table(cells[7]).text().trim(),
            language:    $table(cells[8]).text().trim(),
            level:       $table(cells[9]).text().trim(),
            freeSlots:   $table(cells[10]).text().trim(),
            remarks:     $table(cells[11]).text().trim()
          });
        }
      });

      console.log(`   ✓ ${dept}: ${deptResults.length} classes`);
      return deptResults;

    } catch (err) {
      console.error(`   ❌ Error fetching ${dept}:`, err.message);
      return [];
    }
  }

  async scrapeSchedule(fallbackTerm) {
    let term = await this._getPayloadTerm();
    if (!term || term === 'undefined') {
        console.warn(`   ⚠️ Auto-detection failed. Using fallback: ${fallbackTerm}`);
        term = fallbackTerm;
    }
    
    console.log(`\n📅 Starting Schedule Extraction for term: ${term}...`);
    const results = [];

    const deptCodes = [
        "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", "EC", "ECE", 
        "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", "HI", "SOHUM", "DISCS", 
        "SALT", "INTAC", "IS", "JSP", "KSP", "LAS", "MAL", "MA", "ML", 
        "NSTP (ADAST)", "NSTP (OSCI)", "PH", "PE", "PS", "POS", "PSY", 
        "QMIT", "SB", "SOCSCI", "SA", "TH", "TMP", 
        "ITMGT", "MATH", "MIS", "CS", "HUM", "LIT", "MGT", "MKT", "NF", "NS"
    ];

    console.log(`   Using manual list of ${deptCodes.length} departments.`);
    this.headers['Referer'] = `${this.
