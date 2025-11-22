// src/scraper.js
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

const jar = new CookieJar();
// Use Node 18+/20 global fetch wrapped with fetch-cookie
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

  async login() {
    console.log('🔐 Authenticating...');
    try {
      // GET login page (seed cookies)
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

      await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${this.baseUrl}/j_aisis/displayLogin.do` }
      });

      // After POST, ensure we actually landed on an authenticated page by fetching known landing
      const landingResp = await this._request(`${this.baseUrl}/j_aisis/user/home.do`, { method: 'GET' });
      const landingHtml = await landingResp.text();
      if (!/User Identified As|Welcome|Ateneo/i.test(landingHtml)) {
        console.error('Login landing snippet:', landingHtml.slice(0, 1200));
        throw new Error('Authentication Failed: landing page did not contain expected markers');
      }

      // Optional debug: show collected cookies (uncomment if needed)
      // const cookies = await new Promise((res, rej) => jar.getCookies(this.baseUrl, (err, c) => err ? rej(err) : res(c)));
      // console.log('DEBUG cookies after login:', cookies.map(c => c.cookieString()));

      console.log('✅ Authentication Successful');
      await delay(800);
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
    const params = new URLSearchParams();
    params.append('command', 'displayResults');
    params.append('applicablePeriod', term);
    params.append('deptCode', dept);
    params.append('subjCode', 'ALL');

    try {
      const resp = await this._request(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${this.baseUrl}/j_aisis/J_VCSC.do` }
      });

      const html = await resp.text();

      // session loss detection: if login form returned -> abort
      if (/(sign\s*in|username|password)/i.test(html) && /<form|<input/i.test(html)) {
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
