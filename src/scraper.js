import puppeteer from 'puppeteer';

/**
 * AISIS Scraper Class
 * Handles login and scraping of all 11 AISIS data categories
 */
export class AISISScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://aisis.ateneo.edu';
  }

  /**
   * Initialize browser and page
   */
  async init() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
    console.log('✅ Browser initialized');
  }

  /**
   * Login to AISIS
   */
  async login() {
    console.log('🔐 Logging in to AISIS...');
    
    try {
      // Navigate to login page
      await this.page.goto(`${this.baseUrl}/j_aisis/displayLogin.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Fill in credentials
      await this.page.type('input[name="userName"]', this.username);
      await this.page.type('input[name="password"]', this.password);

      // Submit login form
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        this.page.click('input[type="submit"][value="Sign in"]')
      ]);

      // Check if login was successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('error')) {
        throw new Error('Login failed - check credentials');
      }

      console.log('✅ Login successful');
      return true;
    } catch (error) {
      console.error('❌ Login error:', error.message);
      throw error;
    }
  }

  /**
   * Extract tables from HTML content
   */
  extractTablesFromHTML(html) {
    const tables = [];
    const tableRegex = /<table[\s\S]*?<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHTML = tableMatch[0];
      
      // Extract caption
      const captionMatch = tableHTML.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
      const caption = captionMatch ? this.stripHtml(captionMatch[1]) : null;

      // Extract rows
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const parsedRows = [];
      let rowMatch;

      while ((rowMatch = rowRegex.exec(tableHTML)) !== null) {
        const rowHTML = rowMatch[1];
        const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/(td|th)>/gi;
        const cells = [];
        let cellMatch;
        let isHeaderRow = false;

        while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
          const cellType = (cellMatch[1] || '').toLowerCase();
          if (cellType === 'th') {
            isHeaderRow = true;
          }
          cells.push(this.stripHtml(cellMatch[2] || ''));
        }

        if (cells.length) {
          parsedRows.push({ cells, isHeaderRow });
        }
      }

      if (parsedRows.length === 0) continue;

      const headerEntry = parsedRows.find(row => row.isHeaderRow) || parsedRows[0];
      const headers = headerEntry.cells;
      const dataRows = parsedRows.filter(row => row !== headerEntry).map(row => row.cells);

      tables.push({
        caption,
        headers,
        rows: dataRows,
        totalRows: dataRows.length
      });
    }

    return tables;
  }

  /**
   * Strip HTML tags and clean text
   */
  stripHtml(value = '') {
    return value
      .replace(/<br\s*\/>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean cell text
   */
  cleanCellText(value) {
    if (value === undefined || value === null) return '';
    const stringValue = String(value)
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ');
    const lines = stringValue
      .split('\n')
      .map(line => line.trim())
      .filter((line, index, array) => line.length > 0 || (index > 0 && array[index - 1].length > 0));
    return lines.join('\n').trim();
  }

  /**
   * Scrape Schedule of Classes
   */
  async scrapeScheduleOfClasses() {
    console.log('📅 Scraping Schedule of Classes...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Get all department codes
      const deptCodes = await this.page.evaluate(() => {
        const select = document.querySelector('select[name="deptCode"]');
        if (!select) return [];
        return Array.from(select.options)
          .map(opt => opt.value)
          .filter(val => val && val !== 'ALL');
      });

      console.log(`   Found ${deptCodes.length} departments to scrape`);

      const allSchedules = [];

      // Iterate through each department
      for (let i = 0; i < deptCodes.length; i++) {
        const deptCode = deptCodes[i];
        console.log(`   Scraping department ${i + 1}/${deptCodes.length}: ${deptCode}`);

        try {
          // Submit form for this department
          await this.page.select('select[name="deptCode"]', deptCode);
          await this.page.select('select[name="subjCode"]', 'ALL');
          
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            this.page.click('input[name="command"][value="displayResults"]')
          ]);

          // Extract table data
          const html = await this.page.content();
          const tables = this.extractTablesFromHTML(html);

          // Find the schedule table (has "Subject Code" header)
          const scheduleTable = tables.find(table => 
            table.headers.some(h => h.toLowerCase().includes('subject code'))
          );

          if (scheduleTable && scheduleTable.rows.length > 0) {
            scheduleTable.rows.forEach(row => {
              allSchedules.push({
                department: deptCode,
                subjectCode: row[0] || '',
                section: row[1] || '',
                title: row[2] || '',
                units: row[3] || '',
                time: row[4] || '',
                room: row[5] || '',
                instructor: row[6] || '',
                maxSlots: row[7] || '',
                language: row[8] || '',
                level: row[9] || '',
                freeSlots: row[10] || '',
                remarks: row[11] || ''
              });
            });
            console.log(`   ✓ Found ${scheduleTable.rows.length} classes`);
          }

          // Go back to search page
          await this.page.goto(`${this.baseUrl}/j_aisis/J_VCSC.do`, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });

        } catch (error) {
          console.error(`   ⚠️ Error scraping ${deptCode}:`, error.message);
        }
      }

      console.log(`✅ Schedule of Classes complete: ${allSchedules.length} total classes`);
      return allSchedules;

    } catch (error) {
      console.error('❌ Error scraping Schedule of Classes:', error.message);
      return [];
    }
  }

  /**
   * Scrape Official Curriculum
   */
  async scrapeOfficialCurriculum() {
    console.log('📚 Scraping Official Curriculum...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Get all degree codes
      const degreeCodes = await this.page.evaluate(() => {
        const select = document.querySelector('select[name="degCode"]');
        if (!select) return [];
        return Array.from(select.options)
          .map(opt => opt.value)
          .filter(val => val && val !== '');
      });

      console.log(`   Found ${degreeCodes.length} degree programs to scrape`);

      const allCurriculum = [];

      // Iterate through each degree
      for (let i = 0; i < degreeCodes.length; i++) {
        const degCode = degreeCodes[i];
        console.log(`   Scraping degree ${i + 1}/${degreeCodes.length}: ${degCode}`);

        try {
          await this.page.select('select[name="degCode"]', degCode);
          
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            this.page.evaluate(() => {
              document.querySelector('form').submit();
            })
          ]);

          // Extract table data
          const html = await this.page.content();
          const tables = this.extractTablesFromHTML(html);

          // Process curriculum tables
          tables.forEach(table => {
            if (table.rows.length > 0) {
              let currentYear = '';
              let currentSemester = '';

              table.rows.forEach(row => {
                const firstCell = row[0] || '';
                
                // Check for year/semester markers
                if (firstCell.match(/first year|second year|third year|fourth year/i)) {
                  currentYear = firstCell;
                  currentSemester = '';
                } else if (firstCell.match(/first semester|second semester|summer/i)) {
                  currentSemester = firstCell;
                } else if (row.length >= 3 && row[0]) {
                  // This is a course row
                  allCurriculum.push({
                    degree: degCode,
                    yearLevel: currentYear,
                    semester: currentSemester,
                    courseCode: row[0] || '',
                    description: row[1] || '',
                    units: row[2] || '',
                    category: row[3] || ''
                  });
                }
              });
            }
          });

          console.log(`   ✓ Processed curriculum for ${degCode}`);

          // Go back
          await this.page.goto(`${this.baseUrl}/j_aisis/J_VOFC.do`, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });

        } catch (error) {
          console.error(`   ⚠️ Error scraping ${degCode}:`, error.message);
        }
      }

      console.log(`✅ Official Curriculum complete: ${allCurriculum.length} total courses`);
      return allCurriculum;

    } catch (error) {
      console.error('❌ Error scraping Official Curriculum:', error.message);
      return [];
    }
  }

  /**
   * Scrape View Grades
   */
  async scrapeViewGrades() {
    console.log('📊 Scraping View Grades...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VG.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const grades = [];
      
      tables.forEach(table => {
        if (table.headers.some(h => h.toLowerCase().includes('school year') || h.toLowerCase().includes('grade'))) {
          table.rows.forEach(row => {
            if (row.length >= 5) {
              grades.push({
                schoolYear: row[0] || '',
                semester: row[1] || '',
                courseCode: row[2] || '',
                description: row[3] || '',
                units: row[4] || '',
                grade: row[5] || '',
                qpi: row[6] || ''
              });
            }
          });
        }
      });

      console.log(`✅ View Grades complete: ${grades.length} records`);
      return grades;

    } catch (error) {
      console.error('❌ Error scraping View Grades:', error.message);
      return [];
    }
  }

  /**
   * Scrape Advisory Grades
   */
  async scrapeAdvisoryGrades() {
    console.log('📋 Scraping Advisory Grades...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VAG.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const advisoryGrades = [];
      
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 3) {
            advisoryGrades.push({
              courseCode: row[0] || '',
              description: row[1] || '',
              units: row[2] || '',
              grade: row[3] || '',
              remarks: row[4] || ''
            });
          }
        });
      });

      console.log(`✅ Advisory Grades complete: ${advisoryGrades.length} records`);
      return advisoryGrades;

    } catch (error) {
      console.error('❌ Error scraping Advisory Grades:', error.message);
      return [];
    }
  }

  /**
   * Scrape Currently Enrolled Classes
   */
  async scrapeEnrolledClasses() {
    console.log('📝 Scraping Currently Enrolled Classes...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VCEC.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const enrolled = [];
      
      const enrolledTable = tables.find(table => 
        table.headers.some(h => h.toLowerCase().includes('subject code'))
      );

      if (enrolledTable) {
        enrolledTable.rows.forEach(row => {
          enrolled.push({
            subjectCode: row[0] || '',
            section: row[1] || '',
            title: row[2] || '',
            units: row[3] || '',
            time: row[4] || '',
            room: row[5] || '',
            instructor: row[6] || ''
          });
        });
      }

      console.log(`✅ Currently Enrolled complete: ${enrolled.length} classes`);
      return enrolled;

    } catch (error) {
      console.error('❌ Error scraping Currently Enrolled:', error.message);
      return [];
    }
  }

  /**
   * Scrape My Class Schedule
   */
  async scrapeClassSchedule() {
    console.log('🗓️ Scraping My Class Schedule...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VMCS.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const schedule = [];
      
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 4) {
            schedule.push({
              courseCode: row[0] || '',
              section: row[1] || '',
              time: row[2] || '',
              room: row[3] || '',
              instructor: row[4] || ''
            });
          }
        });
      });

      console.log(`✅ My Class Schedule complete: ${schedule.length} classes`);
      return schedule;

    } catch (error) {
      console.error('❌ Error scraping My Class Schedule:', error.message);
      return [];
    }
  }

  /**
   * Scrape Tuition Receipt
   */
  async scrapeTuitionReceipt() {
    console.log('💰 Scraping Tuition Receipt...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_PTR.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const receipts = [];
      
      tables.forEach(table => {
        if (table.headers.some(h => h.toLowerCase().includes('amount') || h.toLowerCase().includes('o.r'))) {
          table.rows.forEach(row => {
            receipts.push({
              orNumber: row[0] || '',
              date: row[1] || '',
              amount: row[2] || '',
              remarks: row[3] || ''
            });
          });
        }
      });

      console.log(`✅ Tuition Receipt complete: ${receipts.length} records`);
      return receipts;

    } catch (error) {
      console.error('❌ Error scraping Tuition Receipt:', error.message);
      return [];
    }
  }

  /**
   * Scrape Student Information
   */
  async scrapeStudentInfo() {
    console.log('👤 Scraping Student Information...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_STUD_INFO.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const studentInfo = {};
      
      // Extract key-value pairs from tables
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 2) {
            const key = this.cleanCellText(row[0]);
            const value = this.cleanCellText(row[1]);
            if (key && value) {
              studentInfo[key] = value;
            }
          }
        });
      });

      console.log(`✅ Student Information complete`);
      return [studentInfo];

    } catch (error) {
      console.error('❌ Error scraping Student Information:', error.message);
      return [];
    }
  }

  /**
   * Scrape Program of Study
   */
  async scrapeProgramOfStudy() {
    console.log('🎓 Scraping Program of Study...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VPOS.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const program = [];
      
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 3) {
            program.push({
              courseCode: row[0] || '',
              description: row[1] || '',
              units: row[2] || '',
              grade: row[3] || '',
              status: row[4] || ''
            });
          }
        });
      });

      console.log(`✅ Program of Study complete: ${program.length} courses`);
      return program;

    } catch (error) {
      console.error('❌ Error scraping Program of Study:', error.message);
      return [];
    }
  }

  /**
   * Scrape Hold Orders
   */
  async scrapeHoldOrders() {
    console.log('🚫 Scraping Hold Orders...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VHOR.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const holds = [];
      
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 3) {
            holds.push({
              department: row[0] || '',
              holdType: row[1] || '',
              reason: row[2] || '',
              dateAdded: row[3] || ''
            });
          }
        });
      });

      console.log(`✅ Hold Orders complete: ${holds.length} holds`);
      return holds;

    } catch (error) {
      console.error('❌ Error scraping Hold Orders:', error.message);
      return [];
    }
  }

  /**
   * Scrape Faculty Attendance
   */
  async scrapeFacultyAttendance() {
    console.log('📊 Scraping Faculty Attendance...');
    
    try {
      await this.page.goto(`${this.baseUrl}/j_aisis/J_VFA.do`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      const html = await this.page.content();
      const tables = this.extractTablesFromHTML(html);

      const attendance = [];
      
      tables.forEach(table => {
        table.rows.forEach(row => {
          if (row.length >= 3) {
            attendance.push({
              courseCode: row[0] || '',
              section: row[1] || '',
              present: row[2] || '',
              absent: row[3] || '',
              late: row[4] || '',
              excused: row[5] || ''
            });
          }
        });
      });

      console.log(`✅ Faculty Attendance complete: ${attendance.length} records`);
      return attendance;

    } catch (error) {
      console.error('❌ Error scraping Faculty Attendance:', error.message);
      return [];
    }
  }

  /**
   * Scrape all data
   */
  async scrapeAll() {
    console.log('🎯 Starting full scrape of all 11 categories...\n');
    
    const results = {
      timestamp: new Date().toISOString(),
      scheduleOfClasses: [],
      officialCurriculum: [],
      viewGrades: [],
      advisoryGrades: [],
      enrolledClasses: [],
      classSchedule: [],
      tuitionReceipt: [],
      studentInfo: [],
      programOfStudy: [],
      holdOrders: [],
      facultyAttendance: []
    };

    try {
      await this.init();
      await this.login();

      results.scheduleOfClasses = await this.scrapeScheduleOfClasses();
      results.officialCurriculum = await this.scrapeOfficialCurriculum();
      results.viewGrades = await this.scrapeViewGrades();
      results.advisoryGrades = await this.scrapeAdvisoryGrades();
      results.enrolledClasses = await this.scrapeEnrolledClasses();
      results.classSchedule = await this.scrapeClassSchedule();
      results.tuitionReceipt = await this.scrapeTuitionReceipt();
      results.studentInfo = await this.scrapeStudentInfo();
      results.programOfStudy = await this.scrapeProgramOfStudy();
      results.holdOrders = await this.scrapeHoldOrders();
      results.facultyAttendance = await this.scrapeFacultyAttendance();

      console.log('\n✅ All scraping complete!');
      
    } catch (error) {
      console.error('\n❌ Scraping failed:', error.message);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        console.log('🔒 Browser closed');
      }
    }

    return results;
  }
}
