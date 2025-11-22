import * as cheerio from 'cheerio';

/**
 * Parse curriculum HTML into structured course rows
 * 
 * This parser extracts curriculum data from AISIS J_VOFC.do HTML pages.
 * It identifies year/semester headers and course rows, producing a flat array
 * of structured course objects suitable for Google Sheets and database sync.
 * 
 * Expected HTML structure (from HAR analysis):
 * - Program title: td.header06 or similar header classes
 * - Year headers: td.text06 (e.g., "First Year", "Second Year")
 * - Semester headers: td.text04 (e.g., "First Semester - 20.0 Units")
 * - Course rows: tr with td.text02 containing:
 *   - Cat No (course code)
 *   - Course Title
 *   - Units
 *   - Prerequisites (optional)
 *   - Category (M, C, etc.)
 * 
 * @module curriculum-parser
 */

/**
 * Parse year level from text like "First Year", "Second Year", etc.
 * @param {string} text - Year header text
 * @returns {number|null} Year level (1-4) or null if not recognized
 */
function parseYearLevel(text) {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  if (lowerText.includes('first')) return 1;
  if (lowerText.includes('second')) return 2;
  if (lowerText.includes('third')) return 3;
  if (lowerText.includes('fourth')) return 4;
  
  // Also check for patterns like "1st Year", "2nd Year"
  const match = lowerText.match(/(\d+)(st|nd|rd|th)\s*year/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1 && year <= 4) return year;
  }
  
  return null;
}

/**
 * Parse semester from text like "First Semester", "Second Semester"
 * @param {string} text - Semester header text
 * @returns {number|null} Semester (1 or 2) or null if not recognized
 */
function parseSemester(text) {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  if (lowerText.includes('first semester') || lowerText.includes('1st semester')) return 1;
  if (lowerText.includes('second semester') || lowerText.includes('2nd semester')) return 2;
  
  return null;
}

/**
 * Parse units from text, returning a number
 * @param {string} text - Units text (e.g., "3.0", "5", "3.0 Units")
 * @returns {number} Parsed units or 0 if invalid
 */
function parseUnits(text) {
  if (!text) return 0;
  // Remove "Units" suffix and parse
  const cleaned = text.replace(/\s*units?\s*/gi, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract program title from HTML
 * Looks for common header patterns in AISIS curriculum pages
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {string|null} Program title or null if not found
 */
function extractProgramTitle($) {
  // Try various header selectors
  const headerSelectors = [
    'td.header06',
    'div.pageHeader',
    'table:first tr:first td:first',
    'td.header',
    'h1',
    'h2'
  ];
  
  for (const selector of headerSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      const text = element.text().trim();
      // Only accept if it looks like a program title (not too short, not too long)
      if (text && text.length > 5 && text.length < 200) {
        return text;
      }
    }
  }
  
  return null;
}

/**
 * Parse curriculum HTML into structured course rows
 * 
 * @param {string} html - Raw curriculum HTML from J_VOFC.do
 * @param {string} degCode - Degree code (e.g., 'BS CS_2024_1')
 * @param {string} label - Program label (e.g., 'BS Computer Science (2024-1)')
 * @returns {Array<Object>} Array of structured course row objects
 */
export function parseCurriculumHtml(html, degCode, label) {
  const $ = cheerio.load(html);
  const rows = [];
  
  // Extract program title from HTML (fallback to label if not found)
  const programTitle = extractProgramTitle($) || label;
  
  // State tracking for current context
  let currentYear = null;
  let currentSemester = null;
  
  // Traverse all table rows
  $('tr').each((_, row) => {
    const $row = $(row);
    
    // Check for year header (td.text06)
    const yearHeader = $row.find('td.text06');
    if (yearHeader.length > 0) {
      const yearText = yearHeader.first().text().trim();
      const yearLevel = parseYearLevel(yearText);
      if (yearLevel !== null) {
        currentYear = yearLevel;
        // Reset semester when changing years
        currentSemester = null;
      }
      return; // Continue to next row
    }
    
    // Check for semester header (td.text04)
    const semesterHeader = $row.find('td.text04');
    if (semesterHeader.length > 0) {
      const semesterText = semesterHeader.first().text().trim();
      const semester = parseSemester(semesterText);
      if (semester !== null) {
        currentSemester = semester;
      }
      return; // Continue to next row
    }
    
    // Check for course rows (td.text02)
    const courseCells = $row.find('td.text02');
    if (courseCells.length >= 2) {
      // Extract cell texts
      const cellTexts = courseCells.map((_, cell) => $(cell).text().trim()).get();
      
      // Course row typically has:
      // [0] Cat No (course code)
      // [1] Course Title
      // [2] Units
      // [3] Prerequisites (optional)
      // [4] Category (optional)
      
      const courseCode = cellTexts[0] || '';
      const courseTitle = cellTexts[1] || '';
      const unitsText = cellTexts[2] || '0';
      const prerequisites = cellTexts[3] || null;
      const category = cellTexts[4] || null;
      
      // Only add row if we have at least a course code
      if (courseCode?.trim()) {
        rows.push({
          deg_code: degCode,
          program_label: label,
          program_title: programTitle,
          year_level: currentYear,
          semester: currentSemester,
          course_code: courseCode.trim(),
          course_title: courseTitle.trim(),
          units: parseUnits(unitsText),
          prerequisites: prerequisites?.trim() || null,
          category: category?.trim() || null
        });
      }
    }
  });
  
  return rows;
}

/**
 * Parse all curriculum programs into structured course rows
 * 
 * Takes the output from scrapeCurriculum() which contains raw HTML,
 * and converts each program's HTML into structured course rows.
 * 
 * @param {Array<Object>} curriculumPrograms - Array of { degCode, label, html } objects
 * @returns {Object} Object with { programs: Array, allRows: Array }
 *   - programs: Array of { degCode, label, program_title, rows } for detailed view
 *   - allRows: Flattened array of all course rows for Sheets sync
 */
export function parseAllCurricula(curriculumPrograms) {
  const programs = [];
  const allRows = [];
  
  for (const program of curriculumPrograms) {
    const { degCode, label, html } = program;
    
    if (!html) {
      console.warn(`   ⚠️ No HTML for ${degCode} - skipping`);
      continue;
    }
    
    // Parse the HTML into structured rows
    const rows = parseCurriculumHtml(html, degCode, label);
    
    // Store program with its rows
    if (rows.length > 0) {
      const programTitle = rows[0]?.program_title || label;
      programs.push({
        degCode,
        label,
        program_title: programTitle,
        rows
      });
      
      // Add to flattened list
      allRows.push(...rows);
    } else {
      console.warn(`   ⚠️ No courses found for ${degCode}`);
    }
  }
  
  return {
    programs,
    allRows
  };
}
