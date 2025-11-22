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
    const opts = {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
        'Cookie': this.cookie || ''
      },
      redirect: 'manual'
    };

    const response = await fetch(url, opts);
    const newCookie = response.headers.get('set-cookie');
    if (newCookie) {
      const sessionPart = newCookie.split(';')[0];
      if (sessionPart) this.cookie = sessionPart;
    }
    return response;
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
      if (text.includes('Invalid password') || text.includes('Sign in')) {
        throw new Error('Authentication Failed: Invalid credentials.');
      }
      console.log('✅ Authentication Successful');
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error('⛔ Critical Login Error:', error.message);
      throw error;
    }
  }

  async scrapeSchedule(term) {
    console.log(`\n📅 Starting Schedule Extraction for term: ${term}...`);
    const results = [];

    const deptCodes = [
        "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", "EC", "ECE", 
        "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", "HI", "SOHUM", "DISCS", 
        "SALT", "INTAC", "IS", "JSP", "KSP", "LAS", "MAL", "MA", "ML", 
        "NSTP (ADAST)", "NSTP (OSCI)", "PH", "PE", "PS", "POS", "PSY", 
        "QMIT", "SB", "SOCSCI", "SA", "TH", "TMP", "ITMGT", "MATH", "MIS", "CS",
        "HUM", "LIT", "MGT", "MKT", "NF", "NS", "PE", "PH", "POS", "PS", "PSY" 
    ];

    console.log(`   Using manual list of ${deptCodes.length} departments.`);
    this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VCSC.do`;

    for (const dept of deptCodes) {
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
        const $table = cheerio.load(html);
        let deptCount = 0;

        $table('table tr').each((i, row) => {
          const cells = $table(row).find('td');
          
          if (cells.length > 10) {
            const subject = $table(cells[0]).text().trim();
            if (subject.includes('Ateneo Integrated') || subject === '') return; 

            results.push({
              department:  dept,
              subjectCode: subject,
              section:     $table(cells[1]).text().trim(),
              courseTitle: $table(cells[2]).text().trim(),
              units:       $table(cells[3]).text().trim(),
              time:        $table(cells[4]).text().trim(),
              room:        $table(cells[5]).text().trim(),
              instructor:  $table(cells[6]).text().trim(),
              maxSlots:    $table(cells[7]).text().trim(),
              language:    $table(cells[8]).text().trim(),
              level:       $table(cells[9]).text().trim(),
              freeSlots:   $table(cells[10]).text().trim(),
              remarks:     $table(cells[11]).text().trim()
            });
            deptCount++;
          }
        });

        if (deptCount > 0) console.log(`   ✓ ${dept}: ${deptCount} classes`);
        await new Promise(r => setTimeout(r, 50)); 

      } catch (err) {
        console.error(`   ❌ Error fetching ${dept}:`, err.message);
      }
    }

    console.log(`✅ Schedule extraction complete: ${results.length} total classes`);
    return results;
  }

  async scrapeCurriculum() {
    console.log('\n📚 Starting Curriculum Extraction...');
    const results = [];

    const degrees = [
        "BS CS", "BS MIS", "BS ITE", "BS AMF", "BS MGT", "BS BIO", "BS CH",
        "BS ES", "BS HSc", "BS LM", "BS MAC", "BS ME", "BS PS", "BS PSY",
        "AB COM", "AB DS", "AB EC", "AB EU", "AB HI", "AB IS", "AB LIT",
        "AB ME", "AB PH", "AB POS", "AB PSY", "AB SOC", "BFA CW", "BFA ID", "BFA TA"
    ];

    console.log(`   Using manual list of ${degrees.length} degree programs.`);
    this.headers['Referer'] = `${this.baseUrl}/j_aisis/J_VOFC.do`;

    for (const degree of degrees) { 
      const params = new URLSearchParams();
      params.append('degCode', degree);

      try {
        const r2 = await this._request(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
            method: 'POST',
            body: params
        });

        const pageHtml = await r2.text();
        const $p = cheerio.load(pageHtml);
        
        let year = '', sem = '';
        $p('table tr').each((i, row) => {
            const text = $p(row).text().toLowerCase();
            const cells = $p(row).find('td');
            
            if (text.includes('year')) year = $p(row).text().trim();
            else if (text.includes('semester')) sem = $p(row).text().trim();
            else if (cells.length >= 3) {
                const code = $p(cells[0]).text().trim();
                if (code.includes('Ateneo Integrated')) return;

                results.push({
                    degreeCode: degree,
                    yearLevel: year,
                    semester: sem,
                    courseCode: code,
                    courseTitle: $p(cells[1]).text().trim(),
                    units: $p(cells[2]).text().trim()
                });
            }
        });
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { }
    }

    console.log(`✅ Curriculum extraction complete: ${results.length} items`);
    return results;
  }

  async close() {
    console.log('🔒 Session Closed');
  }
}
