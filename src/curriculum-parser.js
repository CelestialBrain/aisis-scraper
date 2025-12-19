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
 * Helper to trim a string and return null if empty
 * @param {string|null|undefined} str - String to trim
 * @returns {string|null} Trimmed string or null
 */
function trimOrNull(str) {
  return str?.trim() || null;
}

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
 * Parse prerequisites from AISIS curriculum table cell
 * Converts raw prerequisite text into an array of course codes
 * 
 * @param {string|null|undefined} prereqText - Raw prerequisite text
 *   Input examples: "MATH 31.1, PHILO 11" or "DECSC 25" or "" or "-" or "None"
 * @returns {string[]} Array of prerequisite course codes
 *   Output: ["MATH 31.1", "PHILO 11"] or ["DECSC 25"] or []
 */
function parsePrerequisites(prereqText) {
  if (!prereqText || prereqText === '-' || prereqText.toLowerCase() === 'none') {
    return [];
  }

  // Split by comma, but handle course codes that might have internal structure
  // Split on comma followed by optional whitespace and a capital letter
  return prereqText
    .split(/,(?=\s*[A-Z])/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && p !== '-' && p.toLowerCase() !== 'none');
}

/**
 * Extract program title from HTML
 * Looks for common header patterns in AISIS curriculum pages
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {string|null} Program title or null if not found
 */
export function extractProgramTitle($) {
  // Try various header selectors in priority order
  // More specific selectors (like td.header06) are tried first
  // Generic fallback selector (table:first tr:first td:first) is tried last
  const headerSelectors = [
    'td.header06',      // AISIS curriculum page header (most common)
    'div.pageHeader',   // Alternative page header
    'td.header',        // Generic header cell
    'h1',               // Standard HTML heading
    'h2',               // Standard HTML heading
    'table:first tr:first td:first'  // Generic fallback (least specific, tried last)
  ];

  for (const selector of headerSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      const text = element.text().trim();
      // Only accept if it looks like a program title (not too short, not too long)
      // Also exclude text that looks like year headers (e.g., "First Year", "Second Year")
      if (text && text.length > 5 && text.length < 200) {
        // Skip if it looks like a year level header
        if (parseYearLevel(text) !== null) {
          continue;
        }
        // Skip if it looks like a semester header
        if (parseSemester(text) !== null) {
          continue;
        }
        return text;
      }
    }
  }

  return null;
}

/**
 * Normalize a string for comparison (uppercase, collapse whitespace)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeForComparison(str) {
  if (!str) return '';
  return str.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract base program code from degCode
 * Examples: "BS ME_2025_1" -> "BS ME", "AB DS_2024_1" -> "AB DS"
 * @param {string} degCode - Full degree code with version suffix
 * @returns {string} Base program code
 */
function extractBaseProgramCode(degCode) {
  if (!degCode) return '';
  // Split by underscore and take the first part
  const parts = degCode.split('_');
  return parts[0] || '';
}

/**
 * Extract version year and semester from degCode
 * Examples: "BS ME_2025_1" -> { year: 2025, sem: 1 }
 *           "AB DS_2024_2" -> { year: 2024, sem: 2 }
 * @param {string} degCode - Full degree code with version suffix
 * @returns {{ year: number|null, sem: number|null }} Version information
 */
export function extractVersionFromDegCode(degCode) {
  if (!degCode) return { year: null, sem: null };

  // Split by underscore: "BS ME_2025_1" -> ["BS ME", "2025", "1"]
  const parts = degCode.split('_');

  if (parts.length >= 3) {
    const year = parseInt(parts[1], 10);
    const sem = parseInt(parts[2], 10);

    return {
      year: isNaN(year) ? null : year,
      sem: isNaN(sem) ? null : sem
    };
  }

  return { year: null, sem: null };
}

/**
 * Extract version year and semester from program title
 * Handles patterns like:
 * - "Ver Sem 1, Ver Year 2025"
 * - "Ver Year 2025, Ver Sem 1" (alternate order)
 * - "BACHELOR OF SCIENCE IN MANAGEMENT (Ver Sem 1, Ver Year 2018)"
 * 
 * Note: Currently only detects explicit "Ver Year" and "Ver Sem" patterns.
 * Does NOT extract standalone year patterns (e.g., "2025") to avoid false matches.
 * 
 * @param {string} programTitle - Program title from HTML
 * @returns {{ year: number|null, sem: number|null }} Version information
 */
export function extractVersionFromProgramTitle(programTitle) {
  if (!programTitle) return { year: null, sem: null };

  const normalized = programTitle.toUpperCase();

  let year = null;
  let sem = null;

  // Pattern 1: "Ver Year YYYY" or "Ver. Year YYYY"
  const yearMatch = normalized.match(/VER\.?\s+YEAR\s+(\d{4})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Pattern 2: "Ver Sem N" or "Ver. Sem N"
  const semMatch = normalized.match(/VER\.?\s+SEM\s+(\d+)/);
  if (semMatch) {
    sem = parseInt(semMatch[1], 10);
  }

  return { year, sem };
}

/**
 * Check if program title matches the requested degCode and label
 * 
 * This function validates that AISIS returned HTML for the correct program
 * by comparing the HTML program title against the requested degCode and label.
 * 
 * The validation is conservative - it rejects obvious mismatches like:
 * - BS ME vs BS MGT-H
 * - Development Studies vs Applied Mathematics
 * 
 * NEW: Also validates version consistency when both degCode and programTitle
 * contain version information. If versions disagree, this is treated as a mismatch
 * (likely AISIS session bleed).
 * 
 * @param {string} degCode - Requested degree code (e.g., 'BS ME_2025_1')
 * @param {string} label - Requested program label (e.g., 'BS Mechanical Engineering (2025-1)')
 * @param {string} programTitle - Program title extracted from HTML
 * @returns {boolean} True if match, false if obvious mismatch
 */
export function isProgramMatch(degCode, label, programTitle) {
  // FIRST: Validate version consistency (NEW)
  // Extract version from degCode and programTitle
  const degCodeVersion = extractVersionFromDegCode(degCode);
  const titleVersion = extractVersionFromProgramTitle(programTitle);

  // If BOTH degCode and programTitle have version info, they must match
  // If either is missing version info, we skip this check (rely on program name matching only)
  const hasExpectedVersion = degCodeVersion.year !== null && degCodeVersion.sem !== null;
  const hasTitleVersion = titleVersion.year !== null || titleVersion.sem !== null;

  if (hasExpectedVersion && hasTitleVersion) {
    // Both have version info - check for disagreement
    const yearMismatch = titleVersion.year !== null && titleVersion.year !== degCodeVersion.year;
    const semMismatch = titleVersion.sem !== null && titleVersion.sem !== degCodeVersion.sem;

    if (yearMismatch || semMismatch) {
      // VERSION MISMATCH DETECTED - this is session bleed
      console.error(`   🚨 Version mismatch detected!`);
      console.error(`      Expected: Year=${degCodeVersion.year}, Sem=${degCodeVersion.sem} (from degCode: ${degCode})`);
      console.error(`      Found in title: Year=${titleVersion.year}, Sem=${titleVersion.sem} (from programTitle: "${programTitle}")`);
      return false;  // Reject immediately
    }
  }

  // SECOND: Continue with existing program name validation
  // Normalize all inputs for comparison
  const normDegCode = normalizeForComparison(degCode);
  const normLabel = normalizeForComparison(label);
  const normTitle = normalizeForComparison(programTitle);

  // Extract base program code from degCode (e.g., "BS ME" from "BS ME_2025_1")
  const baseCode = normalizeForComparison(extractBaseProgramCode(degCode));

  // Remove version suffix from label (e.g., "(2025-1)", "(2024-1)")
  // Pattern: (YYYY-N) at the end of the string
  const labelWithoutVersion = normLabel.replace(/\s*\(\d{4}-\d+\)\s*$/, '').trim();

  // Also remove "IN" prefix from title if present (e.g., "BACHELOR OF SCIENCE IN COMPUTER SCIENCE")
  const titleWithoutPrefix = normTitle
    .replace(/^BACHELOR OF SCIENCE IN /i, 'BS ')
    .replace(/^BACHELOR OF ARTS IN /i, 'AB ')
    .replace(/^MASTER OF SCIENCE IN /i, 'MS ')
    .replace(/^MASTER OF ARTS IN /i, 'MA ')
    .trim();

  // Check 1: Direct substring match (either direction)
  const labelMatch = normTitle.includes(labelWithoutVersion) ||
    labelWithoutVersion.includes(normTitle) ||
    titleWithoutPrefix.includes(labelWithoutVersion) ||
    labelWithoutVersion.includes(titleWithoutPrefix);

  // Check 2: Program title contains base program code
  const baseCodeMatch = normTitle.includes(baseCode) || titleWithoutPrefix.includes(baseCode);

  // Check 3: Look for significant word overlap between label and title
  // Extract significant words (3+ chars) from both, excluding common words and parentheses
  const commonWords = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM']);
  const labelWords = labelWithoutVersion
    .replace(/[()]/g, ' ')  // Remove parentheses
    .split(/\s+/)
    .filter(w => w.length >= 3 && !commonWords.has(w));
  const titleWords = normTitle
    .replace(/[()]/g, ' ')  // Remove parentheses
    .split(/\s+/)
    .filter(w => w.length >= 3 && !commonWords.has(w));

  // Count overlapping significant words
  const overlappingWords = labelWords.filter(word => titleWords.includes(word));
  const overlapRatio = overlappingWords.length / Math.max(labelWords.length, 1);

  // Check 4: Check for program code abbreviation components in title
  // e.g., "MGT-H" should match if title contains both "MANAGEMENT" and "HONORS"
  // Split base code by hyphens and spaces to get individual components
  const codeComponents = baseCode.split(/[-\s]+/).filter(w => w.length >= 2);

  // For each code component, check if it's a common abbreviation
  // Only include well-known, specific abbreviations to avoid false matches
  const abbreviationMap = {
    'MGT': 'MANAGEMENT',
    'ME': 'MECHANICAL',
    'CS': 'COMPUTER',
    'DS': 'DEVELOPMENT',
    'AM': 'APPLIED MATHEMATICS',
    'ECE': 'ELECTRONICS',
    'CTM': 'COMMUNICATIONS',
    // Note: Single-letter codes like 'H' are intentionally excluded
    // to prevent false matches. They must appear in the base code itself.
  };

  // Check if the title contains the expanded form of each code component
  let codeComponentsFound = 0;
  for (const component of codeComponents) {
    const expanded = abbreviationMap[component] || component;
    // Check if title contains this component or its expansion
    if (normTitle.includes(component) || normTitle.includes(expanded)) {
      codeComponentsFound++;
    }
  }
  const codeComponentRatio = codeComponentsFound / Math.max(codeComponents.length, 1);

  // Consider it a match if:
  // - Direct label match OR
  // - Base code is in title AND reasonable word overlap (40%+) OR
  // - Very high word overlap (70%+) even without base code OR
  // - Most code components found (80%+) and some general word overlap (40%+)
  const isMatch = labelMatch ||
    (baseCodeMatch && overlapRatio >= 0.4) ||
    (overlapRatio >= 0.7) ||
    (codeComponentRatio >= 0.8 && overlapRatio >= 0.4);

  return isMatch;
}

/**
 * Parse curriculum HTML into structured course rows
 * 
 * @param {string} html - Raw curriculum HTML from J_VOFC.do
 * @param {string} degCode - Degree code (e.g., 'BS CS_2024_1')
 * @param {string} label - Program label (e.g., 'BS Computer Science (2024-1)')
 * @returns {Array<Object>} Array of structured course row objects
 * @throws {Error} If HTML program title doesn't match requested degCode/label (session bleed)
 */
export function parseCurriculumHtml(html, degCode, label) {
  const $ = cheerio.load(html);
  const rows = [];

  // Extract program title from HTML (fallback to label if not found)
  const programTitle = extractProgramTitle($) || label;

  // CIRCUIT BREAKER: Validate that HTML matches requested program
  // This prevents contamination from AISIS session bleed / race conditions
  if (!isProgramMatch(degCode, label, programTitle)) {
    console.error(`   🚨 CRITICAL: Curriculum HTML mismatch detected!`);
    console.error(`      Requested degCode: ${degCode}`);
    console.error(`      Requested label: ${label}`);
    console.error(`      HTML program_title: ${programTitle}`);
    console.error(`      This indicates AISIS session bleed - refusing to parse contaminated data`);
    throw new Error(`Curriculum HTML mismatch for ${degCode}: got "${programTitle}" but expected "${label}"`);
  }

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
          prerequisites: parsePrerequisites(prerequisites),
          category: trimOrNull(category)
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
 * Programs with HTML mismatches (session bleed) are skipped and logged.
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

    try {
      // Parse the HTML into structured rows
      // This will throw if HTML doesn't match degCode/label (session bleed)
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
    } catch (error) {
      // Catch mismatch errors and skip this program to prevent contamination
      if (error.message.includes('Curriculum HTML mismatch')) {
        console.warn(`   ⚠️ Skipping ${degCode} due to HTML mismatch (session bleed detected)`);
        console.warn(`      Error: ${error.message}`);
        // Do not push any rows for this program - prevent contamination
      } else {
        // Re-throw unexpected errors
        console.error(`   ❌ Unexpected error parsing ${degCode}: ${error.message}`);
        throw error;
      }
    }
  }

  return {
    programs,
    allRows
  };
}
