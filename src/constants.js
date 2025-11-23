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
