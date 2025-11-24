/**
 * Shared constants for AISIS scraper
 */

/**
 * List of all departments to scrape
 * This should be kept in sync with AISIS department codes
 */
export const DEPARTMENTS = [
  "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", 
  "EC", "ECE", "EN", "ES", "EU", "FIL", "FAA", "FA", "HSP", 
  "HI", "SOHUM", "DISCS", "SALT", "INTAC", "IS", "JSP", "KSP", 
  "LAS", "MAL", "MA", "ML", "NSTP (ADAST)", "NSTP (OSCI)", 
  "PH", "PE", "PS", "POS", "PSY", "QMIT", "SB", "SOCSCI", 
  "SA", "TH", "TMP"
];

/**
 * Sample size for logging invalid records
 */
export const SAMPLE_INVALID_RECORDS_COUNT = 3;

/**
 * Common header/placeholder values that should not be treated as course records
 * Used to filter out table header rows and placeholder data
 */
export const HEADER_MARKERS = {
  SUBJECT_CODE: ['SUBJECT CODE', 'SUBJ CODE', 'CODE'],
  SECTION: ['SECTION', 'SEC'],
  COURSE_TITLE: ['COURSE TITLE', 'TITLE', 'COURSE'],
  UNITS: ['UNITS', 'U'],
  TIME: ['TIME', 'SCHEDULE'],
  ROOM: ['ROOM', 'RM'],
  INSTRUCTOR: ['INSTRUCTOR', 'FACULTY']
};

/**
 * Check if a schedule record appears to be a header or placeholder row
 * @param {Object} record - Schedule record to check
 * @returns {boolean} True if record appears to be a header
 */
export function isHeaderLikeRecord(record) {
  if (!record) return true;
  
  // Check if subject_code or subjectCode matches header markers
  const subjectCode = (record.subject_code || record.subjectCode || '').toUpperCase().trim();
  const courseTitle = (record.course_title || record.title || '').toUpperCase().trim();
  const section = (record.section || '').toUpperCase().trim();
  
  // Check for header marker values
  if (HEADER_MARKERS.SUBJECT_CODE.some(marker => subjectCode === marker)) return true;
  if (HEADER_MARKERS.SECTION.some(marker => section === marker)) return true;
  if (HEADER_MARKERS.COURSE_TITLE.some(marker => courseTitle === marker)) return true;
  
  // Check for obviously invalid patterns
  if (subjectCode === '' && courseTitle === '') return true;
  
  return false;
}

/**
 * Validate that a schedule record has all required fields
 * @param {Object} record - Schedule record to validate (either raw or transformed format)
 * @returns {boolean} True if record has all required fields
 */
export function validateScheduleRecord(record) {
  // Support both raw (subjectCode) and transformed (subject_code) formats
  const termCode = record.term_code;
  const subjectCode = record.subject_code || record.subjectCode;
  const section = record.section;
  const department = record.department;
  
  return !!(
    termCode && termCode.trim() !== '' &&
    subjectCode && subjectCode.trim() !== '' &&
    section && section.trim() !== '' &&
    department && department.trim() !== ''
  );
}

/**
 * Normalize course code to canonical format
 * 
 * Normalizes inconsistent course code formats to a canonical form:
 * - Removes extra whitespace
 * - Standardizes spacing between department and number
 * - Converts to uppercase
 * - Handles common variations (e.g., "CS11", "CS 11", "CS-11" -> "CS 11")
 * 
 * @param {string} rawCode - Raw course code
 * @returns {string} Normalized course code
 */
export function normalizeCourseCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    return '';
  }

  // Trim and convert to uppercase
  let normalized = rawCode.trim().toUpperCase();

  // Replace multiple spaces with single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Replace hyphens with spaces (e.g., "CS-11" -> "CS 11")
  // But preserve hyphens within course numbers (e.g., "MGT-H" stays "MGT-H")
  // Strategy: only replace hyphen if it separates letters from numbers
  normalized = normalized.replace(/([A-Z]+)-(\d)/g, '$1 $2');

  // Add space between letters and numbers if missing (e.g., "CS11" -> "CS 11")
  // But preserve existing format if already spaced
  normalized = normalized.replace(/([A-Z]+)(\d)/g, '$1 $2');

  // Clean up any double spaces that might have been introduced
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * Known course code mappings for common variations
 * Maps non-standard course codes to their canonical forms
 * 
 * This mapping handles known variations in AISIS data where the same
 * course appears with different codes in different contexts.
 * 
 * Common patterns:
 * - EN vs ENGL (English)
 * - PEPC vs PATHFIT (Physical Education)
 * - Abbreviated vs full department codes
 */
export const COURSE_CODE_MAP = {
  // English courses (EN → ENGL)
  // Note: These mappings are applied AFTER normalization
  // So we map the normalized form
  
  // Physical Education mappings
  // 'PEPC 10': 'PATHFIT 1',  // Example - uncomment if confirmed
  
  // Add specific mappings here as discovered from AISIS data
  // Format: 'VARIANT CODE': 'CANONICAL CODE'
};

/**
 * Apply known course code mappings after normalization
 * 
 * @param {string} normalizedCode - Already normalized course code
 * @returns {string} Canonical course code (from map if exists, otherwise returns input)
 */
export function applyCourseMappings(normalizedCode) {
  return COURSE_CODE_MAP[normalizedCode] || normalizedCode;
}
