// src/scraper.js
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

if (!fs.existsSync('debug')) fs.mkdirSync('debug');

const jar = new CookieJar();
// Wrap Node's global fetch with fetch-cookie so cookies are saved in jar
const fetchWithJar = fetchCookie(globalThis.fetch, jar);

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.baseUrl = 'https://aisis.ateneo.edu';
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      Origin: this.baseUrl,
      Referer: `${this.baseUrl}/j_aisis/login.do`,
      Connection: 'keep-alive'
    };
    this.isAuthenticated = false;
  }

  async init() {
    console.log('🚀 Initializing Direct Request Engine...');
  }

  // wrapper around fetchWithJar with timeout + redirect follow
  async _request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const headers = { ...this.headers, ...(options.headers || {}) };
    const opts = {
      ...options,
      headers,
      redirect: 'follow',
      signal: controller.signal
    };

    try {
      const res = await fetchWithJar(url, opts);
      return res;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Request Timeout');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Add session verification method
  async verifySession() {
    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/user/home.do`);
      const html = await resp.text();
      const isLoggedIn = !html.includes('Sign in') && !html.includes('User ID') && html.includes('Ateneo');
      
      if (!isLoggedIn) {
        console.log('🔍 Session verification failed - not logged in');
        this.isAuthenticated = false;
      } else {
        this.isAuthenticated = true;
      }
      
      return isLoggedIn;
    } catch (error) {
      console.log('🔍 Session verification failed - request error:', error.message);
      this.isAuthenticated = false;
      return false;
    }
  }

  // Hardened login: send credentials, follow redirects / candidates, and log debug info
  async login() {
    console.log('🔐 Authenticating...');
    try {
      // 1) GET login page first (seed cookies / tokens)
      console.log('   📥 Getting login page...');
      const displayResp = await this._request(`${this.baseUrl}/j_aisis/displayLogin.do`, { method: 'GET' });
      const displayHtml = await displayResp.text();
      const $d = cheerio.load(displayHtml);
      const rnd = $d('input[name="rnd"]').attr('value') || ('r' + Math.random().toString(36).substring(7));

      const params = new URLSearchParams();
      params.append('userName', this.username);
      params.append('password', this.password);
      params.append('submit', 'Sign in');
      params.append('command', 'login');
      params.append('rnd', rnd);

      // 2) POST credentials
      console.log('   📤 Posting credentials...');
      const loginResp = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Referer': `${this.baseUrl}/j_aisis/displayLogin.do` 
        }
      });

      // 3) Debug: immediate info about the POST response
      console.log('DEBUG login POST -> status:', loginResp.status);
      try {
        console.log('DEBUG login POST -> url:', loginResp.url || '(no url property)');
      } catch (e) {}
      const loginLocation = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('location'));
      const loginSetCookie = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('set-cookie'));
      console.log('DEBUG login POST -> location header:', loginLocation);
      if (loginSetCookie) console.log('DEBUG login POST -> set-cookie header (trim):', String(loginSetCookie).slice(0, 200));

      // 4) If the POST returned an HTML body, check for success markers immediately
      const postHtml = await loginResp.text().catch(() => '');
      if (postHtml && /User Identified As|Welcome|Ateneo/i.test(postHtml)) {
        console.log('✅ Authentication Successful (detected in POST response body)');
        this.isAuthenticated = true;

        // DEBUG: dump cookie jar after login
        try {
          const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
          const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
          fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
          console.log('DEBUG: dumped cookies_after_login.json');
          console.log(`DEBUG: ${cookies.length} cookies in jar`);
        } catch (e) {
          console.log('DEBUG: failed to dump cookie jar after login:', e.message);
        }

        await delay(1000);
        return;
      }

      // 5) If Location header present, follow it explicitly (defensive)
      if (loginLocation) {
        const absolute = loginLocation.startsWith('http') ? loginLocation : (new URL(loginLocation, this.baseUrl)).toString();
        console.log('DEBUG following Location ->', absolute);
        const followResp = await this._request(absolute, { method: 'GET' });
        const followHtml = await followResp.text().catch(() => '');
        if (followHtml && /User Identified As|Welcome|Ateneo/i.test(followHtml)) {
          console.log('✅ Authentication Successful (followed Location header)');
          this.isAuthenticated = true;

          try {
            const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
            const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
            fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
            console.log('DEBUG: dumped cookies_after_login.json');
            console.log(`DEBUG: ${cookies.length} cookies in jar`);
          } catch (e) {
            console.log('DEBUG: failed to dump cookie jar after login:', e.message);
          }

          return;
        } else {
          console.log('DEBUG followResp.status:', followResp.status);
        }
      }

      // 6) Candidate landing pages to try as fallbacks (some AISIS installs differ)
      const candidates = [
        '/j_aisis/user/home.do',
        '/j_aisis/user/home',
        '/j_aisis/home.do',
        '/j_aisis/displayHome.do',
        '/user/home',
        '/j_aisis/jsp/home.do'
      ];

      for (const P of candidates) {
        try {
          const url = new URL(P, this.baseUrl).toString();
          const r = await this._request(url, { method: 'GET' });
          const txt = await r.text().catch(() => '');
          console.log(`DEBUG try candidate ${url} -> status ${r.status}`);
          if (txt && /User Identified As|Welcome|Ateneo/i.test(txt)) {
            console.log('✅ Authentication Successful (candidate):', url);
            this.isAuthenticated = true;

            try {
              const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
              const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
              fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
              console.log('DEBUG: dumped cookies_after_login.json');
              console.log(`DEBUG: ${cookies.length} cookies in jar`);
            } catch (e) {
              console.log('DEBUG: failed to dump cookie jar after login:', e.message);
            }

            return;
          }
        } catch (e) {
          console.log(`DEBUG candidate ${P} failed:`, e.message);
        }
      }

      // 7) If we get here, we failed to find authenticated landing. Save short snippet and raise.
      const snippet = (postHtml || '').slice(0, 2000);
      console.error('Login landing snippet:', snippet.replace(/\n/g, ' '));
      throw new Error('Authentication Failed: landing page did not contain expected markers (checked POST, Location, candidates).');

    } catch (err) {
      console.error('⛔ Critical Login Error:', err.message);
      this.isAuthenticated = false;
      throw err;
    }
  }

  async _getPayloadTerm() {
    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, { method: 'GET' });
      const html = await resp.text();
      const $ = cheerio.load(html);
      let term = $('select[name="applicablePeriod"] option:selected').val();
      if (!term) term = $('select[name="applicablePeriod"] option').first().val();
      return term;
    } catch (e) {
      return null;
    }
  }

  async _scrapeDept(dept, term) {
    // Verify session before each request
    if (!this.isAuthenticated || !await this.verifySession()) {
      throw new Error(`Session expired before fetching ${dept}`);
    }

    const params = new URLSearchParams();
    params.append('command', 'displayResults');
    params.append('applicablePeriod', term);
    params.append('deptCode', dept);
    params.append('subjCode', 'ALL');

    // DEBUG: dump cookies before dept request
    try {
      const cookiesBefore = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
      console.log(`DEBUG: ${cookiesBefore.length} cookies before ${dept} request`);
    } catch (e) {
      console.log(`DEBUG: failed to check cookies before ${dept}:`, e.message);
    }

    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`,
          'Origin': this.baseUrl  // Added Origin header
        }
      });

      const html = await resp.text();

      // session loss detection: if login form returned -> abort
      if (/(sign\s*in|username|password|User ID)/i.test(html) && /<form|<input/i.test(html)) {
        this.isAuthenticated = false;
        
        // Save minimal debug info
        try {
          const snap = (html || '').slice(0, 5000);
          fs.writeFileSync(path.join('debug', `${dept.replace(/\s+/g,'_')}_session_lost.html`), snap, 'utf8');
        } catch (e) {
          console.log('DEBUG: failed to write debug file for', dept, e.message);
        }

        throw new Error(`Session Expired: login page returned when fetching ${dept}`);
      }

      // structural check
      if (!/Subject|Section|Title|Instructor|Room|Time|Units/i.test(html)) {
        throw new Error(`Unexpected page structure for ${dept} — possible session loss or layout change`);
      }

      const $ = cheerio.load(html);
      const results = [];

      // pick tables that look like the result table
      const candidateTables = $('table').filter((i, t) => /Subject|Section|Title|Instructor|Room|Time/i.test($(t).text()));
      const tablesToUse = candidateTables.length ? candidateTables : $('table').slice(0, 1);

      tablesToUse.each((ti, table) => {
        $(table).find('tr').each((ri, tr) => {
          const tds = $(tr).find('td');
          if (tds.length < 6) return; // skip non-data rows
          const get = idx => (tds[idx] ? $(tds[idx]).text().trim() : '');
          const col1 = get(0), col3 = get(2), col4 = get(3);

          if (/subject\s*code|cat\.\s*no\.|title|units/i.test(col1) || !col1) return;

          results.push({
            department: dept,
            subjectCode: col1,
            section: get(1),
            title: col3,
            units: col4,
            time: get(4),
            room: get(5),
            instructor: get(6),
            maxSlots: get(7),
            language: get(8),
            level: get(9),
            freeSlots: get(10),
            remarks: get(11)
          });
        });
      });

      console.log(`   ✓ ${dept}: ${results.length} classes`);
      return results;
    } catch (err) {
      console.error(`   ❌ Error fetching ${dept}:`, err.message);
      this.isAuthenticated = false;
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
      "BIO","CH","CHN","COM","CEPP","CPA","ELM","DS","EC","ECE",
      "EN","ES","EU","FIL","FAA","FA","HSP","HI","SOHUM","DISCS",
      "SALT","INTAC","IS","JSP","KSP","LAS","MAL","MA","ML",
      "NSTP (ADAST)","NSTP (OSCI)","PH","PE","PS","POS","PSY",
      "QMIT","SB","SOCSCI","SA","TH","TMP",
      "ITMGT","MATH","MIS","CS","HUM","LIT","MGT","MKT","NF","NS"
    ];

    console.log(`   Using manual list of ${deptCodes.length} departments.`);
    this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VCSC.do`;

    // Test with just ONE department first to verify the flow
    console.log('   🧪 Testing with single department first...');
    try {
      const testResults = await this._scrapeDept(deptCodes[0], term);
      if (testResults.length > 0) {
        console.log(`   ✅ Test successful! Proceeding with all departments...`);
        results.push(...testResults);
      } else {
        console.log(`   ⚠️ Test department returned no data, but continuing...`);
      }
    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`);
      throw new Error(`Session not maintained after login: ${error.message}`);
    }

    const BATCH_SIZE = 2; // Reduced batch size for stability
    for (let i = 1; i < deptCodes.length; i += BATCH_SIZE) {
      const batch = deptCodes.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(dept => this._scrapeDept(dept, term)));
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          console.log(`   ❌ Failed batch item: ${batch[index]} - ${result.reason.message}`);
        }
      });
      
      await delay(500); // Increased delay between batches
    }

    console.log(`✅ Schedule extraction complete: ${results.length} total classes`);
    return results;
  }

  async close() {
    console.log('🔒 Session Closed');
  }
}      return false;
    }
  }

  // Hardened login: send credentials, follow redirects / candidates, and log debug info
  async login() {
    console.log('🔐 Authenticating...');
    try {
      // 1) GET login page first (seed cookies / tokens)
      const displayResp = await this._request(`${this.baseUrl}/j_aisis/displayLogin.do`, { method: 'GET' });
      const displayHtml = await displayResp.text();
      const $d = cheerio.load(displayHtml);
      const rnd = $d('input[name="rnd"]').attr('value') || ('r' + Math.random().toString(36).substring(7));

      const params = new URLSearchParams();
      params.append('userName', this.username);
      params.append('password', this.password);
      params.append('submit', 'Sign in');
      params.append('command', 'login');
      params.append('rnd', rnd);

      // 2) POST credentials
      const loginResp = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${this.baseUrl}/j_aisis/displayLogin.do` }
      });

      // 3) Debug: immediate info about the POST response
      console.log('DEBUG login POST -> status:', loginResp.status);
      try {
        console.log('DEBUG login POST -> url:', loginResp.url || '(no url property)');
      } catch (e) {}
      const loginLocation = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('location'));
      const loginSetCookie = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('set-cookie'));
      console.log('DEBUG login POST -> location header:', loginLocation);
      if (loginSetCookie) console.log('DEBUG login POST -> set-cookie header (trim):', String(loginSetCookie).slice(0, 200));

      // 4) If the POST returned an HTML body, check for success markers immediately
      const postHtml = await loginResp.text().catch(() => '');
      if (postHtml && /User Identified As|Welcome|Ateneo/i.test(postHtml)) {
        console.log('✅ Authentication Successful (detected in POST response body)');

        // DEBUG: dump cookie jar after login
        try {
          const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
          const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
          fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
          console.log('DEBUG: dumped cookies_after_login.json');
        } catch (e) {
          console.log('DEBUG: failed to dump cookie jar after login:', e.message);
        }

        await delay(800);
        return;
      }

      // 5) If Location header present, follow it explicitly (defensive)
      if (loginLocation) {
        const absolute = loginLocation.startsWith('http') ? loginLocation : (new URL(loginLocation, this.baseUrl)).toString();
        console.log('DEBUG following Location ->', absolute);
        const followResp = await this._request(absolute, { method: 'GET' });
        const followHtml = await followResp.text().catch(() => '');
        if (followHtml && /User Identified As|Welcome|Ateneo/i.test(followHtml)) {
          console.log('✅ Authentication Successful (followed Location header)');

          try {
            const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
            const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
            fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
            console.log('DEBUG: dumped cookies_after_login.json');
          } catch (e) {
            console.log('DEBUG: failed to dump cookie jar after login:', e.message);
          }

          return;
        } else {
          console.log('DEBUG followResp.status:', followResp.status);
        }
      }

      // 6) Candidate landing pages to try as fallbacks (some AISIS installs differ)
      const candidates = [
        '/j_aisis/user/home.do',
        '/j_aisis/user/home',
        '/j_aisis/home.do',
        '/j_aisis/displayHome.do',
        '/user/home',
        '/j_aisis/jsp/home.do'
      ];

      for (const P of candidates) {
        try {
          const url = new URL(P, this.baseUrl).toString();
          const r = await this._request(url, { method: 'GET' });
          const txt = await r.text().catch(() => '');
          console.log(`DEBUG try candidate ${url} -> status ${r.status}`);
          if (txt && /User Identified As|Welcome|Ateneo/i.test(txt)) {
            console.log('✅ Authentication Successful (candidate):', url);

            try {
              const cookies = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
              const cookieData = cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
              fs.writeFileSync(path.join('debug', 'cookies_after_login.json'), JSON.stringify(cookieData, null, 2), 'utf8');
              console.log('DEBUG: dumped cookies_after_login.json');
            } catch (e) {
              console.log('DEBUG: failed to dump cookie jar after login:', e.message);
            }

            return;
          }
        } catch (e) {
          console.log(`DEBUG candidate ${P} failed:`, e.message);
        }
      }

      // 7) If we get here, we failed to find authenticated landing. Save short snippet and raise.
      const snippet = (postHtml || '').slice(0, 2000);
      console.error('Login landing snippet:', snippet.replace(/\n/g, ' '));
      throw new Error('Authentication Failed: landing page did not contain expected markers (checked POST, Location, candidates).');

    } catch (err) {
      console.error('⛔ Critical Login Error:', err.message);
      throw err;
    }
  }

  async _getPayloadTerm() {
    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, { method: 'GET' });
      const html = await resp.text();
      const $ = cheerio.load(html);
      let term = $('select[name="applicablePeriod"] option:selected').val();
      if (!term) term = $('select[name="applicablePeriod"] option').first().val();
      return term;
    } catch (e) {
      return null;
    }
  }

  async _scrapeDept(dept, term) {
    // Verify session before each request
    if (!await this.verifySession()) {
      throw new Error(`Session expired before fetching ${dept}`);
    }

    const params = new URLSearchParams();
    params.append('command', 'displayResults');
    params.append('applicablePeriod', term);
    params.append('deptCode', dept);
    params.append('subjCode', 'ALL');

    // DEBUG: dump cookies before dept request
    try {
      const cookiesBefore = await new Promise((resolve, reject) => jar.getCookies(this.baseUrl, (err, c) => err ? reject(err) : resolve(c)));
      const cbData = cookiesBefore.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly }));
      fs.writeFileSync(path.join('debug', `cookies_before_${dept.replace(/\s+/g,'_')}.json`), JSON.stringify(cbData, null, 2), 'utf8');
      console.log(`DEBUG: dumped cookies_before_${dept}.json`);
    } catch (e) {
      console.log(`DEBUG: failed to dump cookies before ${dept}:`, e.message);
    }

    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Referer': `${this.baseUrl}/j_aisis/J_VCSC.do`,
          'Origin': this.baseUrl  // Added Origin header
        }
      });

      const html = await resp.text();

      // session loss detection: if login form returned -> abort
      if (/(sign\s*in|username|password)/i.test(html) && /<form|<input/i.test(html)) {
        // before throwing, save debug snapshot and headers
        try {
          const hdrs = {};
          if (resp && resp.headers) {
            if (typeof resp.headers.raw === 'function') {
              Object.assign(hdrs, resp.headers.raw());
            } else {
              for (const [k, v] of resp.headers.entries()) hdrs[k] = v;
            }
          }
          const meta = {
            status: resp.status,
            url: resp.url || `${this.baseUrl}/j_aisis/J_VCSC.do`,
            headers: hdrs
          };
          fs.writeFileSync(path.join('debug', `${dept.replace(/\s+/g,'_')}_meta.json`), JSON.stringify(meta, null, 2), 'utf8');

          const snap = (html || '').slice(0, 40000);
          fs.writeFileSync(path.join('debug', `${dept.replace(/\s+/g,'_')}_snapshot.html`), snap, 'utf8');
          console.log(`DEBUG: saved ${dept} meta + snapshot`);
        } catch (e) {
          console.log('DEBUG: failed to write debug files for', dept, e.message);
        }

        throw new Error(`Session Expired: login page returned when fetching ${dept}`);
      }

      // structural check
      if (!/Subject|Section|Title|Instructor|Room|Time|Units/i.test(html)) {
        throw new Error(`Unexpected page structure for ${dept} — possible session loss or layout change`);
      }

      const $ = cheerio.load(html);
      const results = [];

      // pick tables that look like the result table
      const candidateTables = $('table').filter((i, t) => /Subject|Section|Title|Instructor|Room|Time/i.test($(t).text()));
      const tablesToUse = candidateTables.length ? candidateTables : $('table').slice(0, 1);

      tablesToUse.each((ti, table) => {
        $(table).find('tr').each((ri, tr) => {
          const tds = $(tr).find('td');
          if (tds.length < 6) return; // skip non-data rows
          const get = idx => (tds[idx] ? $(tds[idx]).text().trim() : '');
          const col1 = get(0), col3 = get(2), col4 = get(3);

          if (/subject\s*code|cat\.\s*no\.|title|units/i.test(col1) || !col1) return;

          results.push({
            department: dept,
            subjectCode: col1,
            section: get(1),
            title: col3,
            units: col4,
            time: get(4),
            room: get(5),
            instructor: get(6),
            maxSlots: get(7),
            language: get(8),
            level: get(9),
            freeSlots: get(10),
            remarks: get(11)
          });
        });
      });

      console.log(`   ✓ ${dept}: ${results.length} classes`);
      return results;
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
      "BIO","CH","CHN","COM","CEPP","CPA","ELM","DS","EC","ECE",
      "EN","ES","EU","FIL","FAA","FA","HSP","HI","SOHUM","DISCS",
      "SALT","INTAC","IS","JSP","KSP","LAS","MAL","MA","ML",
      "NSTP (ADAST)","NSTP (OSCI)","PH","PE","PS","POS","PSY",
      "QMIT","SB","SOCSCI","SA","TH","TMP",
      "ITMGT","MATH","MIS","CS","HUM","LIT","MGT","MKT","NF","NS"
    ];

    console.log(`   Using manual list of ${deptCodes.length} departments.`);
    this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VCSC.do`;

    const BATCH_SIZE = 4;
    for (let i = 0; i < deptCodes.length; i += BATCH_SIZE) {
      const batch = deptCodes.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(dept => this._scrapeDept(dept, term)));
      batchResults.forEach(res => results.push(...res));
      await delay(350);
    }

    console.log(`✅ Schedule extraction complete: ${results.length} total classes`);
    return results;
  }

  async close() {
    console.log('🔒 Session Closed');
  }
}
