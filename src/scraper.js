import puppeteer from 'puppeteer';

/**
 * AISIS Scraper - Production Grade
 * Implements native DOM extraction for 100% accuracy and stealth navigation.
 * Focuses on institutional data: Schedule of Classes and Official Curriculum.
 */
export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://aisis.ateneo.edu';
    
    // Configuration constants
    this.CONFIG = {
      viewport: { width: 1366, height: 768 },
      timeout: 60000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
  }

  /**
   * Initialize the headless browser with stealth settings
   */
  async init() {
    console.log('🚀 Initializing Scraper Engine...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled' // Stealth feature
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport(this.CONFIG.viewport);
    await this.page.setUserAgent(this.CONFIG.userAgent);
  }

  /**
   * Utility: Human-like delay (jitter) to prevent rate limiting
   */
  async sleep(min = 500, max = 1500) {
    const duration = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Secure Login Sequence
   */
  async login() {
    console.log('🔐 Authenticating...');
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/displayLogin.do`, { 
        waitUntil: 'networkidle2',
        timeout: this.CONFIG.timeout 
      });

      // Type credentials with slight delay between keystrokes (human-like)
      await this.page.type('input[name="userName"]', this.username, { delay: 50 });
      await this.page.type('input[name="password"]', this.password, { delay: 50 });
      
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click('input[type="submit"][value="Sign in"]')
      ]);

      // Verification
      if (this.page.url().includes('login.do')) {
        throw new Error('Authentication Failed: Check your username and password.');
      }
      console.log('✅ Authentication Successful');
    } catch (error) {
      console.error('⛔ Critical Login Error:', error.message);
      throw error;
    }
  }

  /**
   * Core Scraper: Schedule of Classes
   * Uses page.evaluate() to run code INSIDE the browser for perfect extraction.
   */
  async scrapeSchedule() {
    console.log('\n📅 Starting Schedule Extraction...');
    const results = [];

    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VCSC.do`, { waitUntil: 'networkidle2' });

      // Extract Dept Codes directly from the <select> element
      const deptCodes = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('select[name="deptCode"] option'))
          .map(opt => opt.value)
          .filter(val => val && val !== 'ALL');
      });

      console.log(`   Found ${deptCodes.length} departments to process.`);

      // Loop through departments
      for (const dept of deptCodes) {
        // Interact with the form
        await this.page.select('select[name="deptCode"]', dept);
        await this.page.select('select[name="subjCode"]', 'ALL');
        await this.page.click('input[name="command"][value="displayResults"]');
        
        try {
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        } catch (e) {
            console.warn(`   ⚠️ Timeout loading ${dept}, skipping...`);
            continue;
        }

        // NATIVE DOM EXTRACTION
        const deptData = await this.page.evaluate((currentDept) => {
          const rows = Array.from(document.querySelectorAll('table tr'));
          const data = [];

          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            // Filter out header rows and empty rows by checking cell count
            if (cells.length > 10) {
              data.push({
                department:  currentDept,
                subjectCode: cells[0]?.innerText.trim(),
                section:     cells[1]?.innerText.trim(),
                title:       cells[2]?.innerText.trim(),
                units:       cells[3]?.innerText.trim(),
                time:        cells[4]?.innerText.trim(),
                room:        cells[5]?.innerText.trim(),
                instructor:  cells[6]?.innerText.trim(),
                maxSlots:    cells[7]?.innerText.trim(),
                language:    cells[8]?.innerText.trim(),
                level:       cells[9]?.innerText.trim(),
                freeSlots:   cells[10]?.innerText.trim(),
                remarks:     cells[11]?.innerText.trim()
              });
            }
          });
          return data;
        }, dept);

        if (deptData.length > 0) {
          console.log(`   ✓ ${dept}: Extracted ${deptData.length} classes`);
          results.push(...deptData);
        }

        // Return to search (Breadcrumb navigation or Back)
        await this.page.goto(`${this.baseUrl}/j_aisis/J_VCSC.do`, { waitUntil: 'domcontentloaded' });
        await this.sleep(300, 800); // Short rest to be polite to the server
      }
    } catch (error) {
      console.error('   ❌ Schedule Scrape Error:', error.message);
    }
    
    console.log(`✅ Schedule of Classes complete: ${results.length} total classes`);
    return results;
  }

  /**
   * Core Scraper: Official Curriculum
   */
  async scrapeCurriculum() {
    console.log('\n📚 Starting Curriculum Extraction...');
    const results = [];

    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VOFC.do`, { waitUntil: 'networkidle2' });

      const degrees = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('select[name="degCode"] option'))
          .map(o => o.value)
          .filter(v => v);
      });

      console.log(`   Found ${degrees.length} degree programs.`);

      for (const degree of degrees) {
        await this.page.select('select[name="degCode"]', degree);
        await this.page.evaluate(() => document.querySelector('form').submit());
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

        const curriculumData = await this.page.evaluate((deg) => {
          const items = [];
          let year = '';
          let sem = '';
          
          document.querySelectorAll('table tr').forEach(row => {
            const text = row.innerText.toLowerCase();
            const cells = row.querySelectorAll('td');

            // Context-aware parsing: Detects headers vs content rows
            if (text.includes('year')) year = row.innerText.trim();
            else if (text.includes('semester') || text.includes('summer')) sem = row.innerText.trim();
            else if (cells.length >= 3) {
              items.push({
                degree: deg,
                yearLevel: year,
                semester: sem,
                courseCode: cells[0]?.innerText.trim(),
                description: cells[1]?.innerText.trim(),
                units: cells[2]?.innerText.trim(),
                category: cells[3]?.innerText.trim() || ''
              });
            }
          });
          return items;
        }, degree);

        if (curriculumData.length > 0) {
            console.log(`   ✓ ${degree}: Processed`);
            results.push(...curriculumData);
        }
        
        await this.page.goto(`${this.baseUrl}/j_aisis/J_VOFC.do`, { waitUntil: 'domcontentloaded' });
        await this.sleep(300, 800);
      }
    } catch (error) {
      console.error('   ❌ Curriculum Scrape Error:', error.message);
    }
    
    console.log(`✅ Official Curriculum complete: ${results.length} total items`);
    return results;
  }

  /**
   * Graceful Shutdown
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser Session Closed');
    }
  }
}
