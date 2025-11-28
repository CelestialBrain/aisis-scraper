/**
 * Term calculation utilities for AISIS scraper
 * 
 * Term codes follow the format YYYY-S where:
 * - YYYY is the academic year (e.g., 2024, 2025)
 * - S is the semester: 0 (Intersession), 1 (First Semester), 2 (Second Semester)
 * 
 * Academic year cycle: YYYY-0 (Intersession) → YYYY-1 (1st Sem) → YYYY-2 (2nd Sem) → (YYYY+1)-0
 */

import { getTermYear } from './constants.js';

/**
 * Get the next term code given a current term
 * 
 * The term cycle is:
 * - YYYY-0 (Intersession) → YYYY-1 (First Semester)
 * - YYYY-1 (First Semester) → YYYY-2 (Second Semester)
 * - YYYY-2 (Second Semester) → (YYYY+1)-0 (Next year's Intersession)
 * 
 * @param {string} termCode - Current term code (e.g., '2025-1')
 * @returns {string|null} Next term code (e.g., '2025-2'), or null if invalid format
 * 
 * @example
 * getNextTerm('2025-0')  // returns '2025-1'
 * getNextTerm('2025-1')  // returns '2025-2'
 * getNextTerm('2025-2')  // returns '2026-0'
 */
export function getNextTerm(termCode) {
  if (!termCode || typeof termCode !== 'string') {
    return null;
  }
  
  const parts = termCode.split('-');
  if (parts.length !== 2) {
    return null;
  }
  
  const year = parseInt(parts[0], 10);
  const semester = parseInt(parts[1], 10);
  
  if (isNaN(year) || isNaN(semester)) {
    return null;
  }
  
  // Term cycle: 0 → 1 → 2 → 0 (with year increment)
  if (semester === 0) {
    return `${year}-1`;
  } else if (semester === 1) {
    return `${year}-2`;
  } else if (semester === 2) {
    // Roll over to next year's intersession
    return `${year + 1}-0`;
  } else {
    // Unexpected semester value (e.g., 3, 4, etc.)
    // AISIS only uses 0, 1, 2 - return null for invalid values
    console.warn(`Unexpected semester value in term code: ${termCode}. Expected 0, 1, or 2.`);
    return null;
  }
}

/**
 * Get both current term and next term as an array
 * 
 * This is the primary helper for the "current + next term" scraping strategy.
 * Returns [currentTerm, nextTerm] which can be passed to scrapeMultipleTerms().
 * 
 * @param {string} currentTerm - Current term code (e.g., '2025-1')
 * @returns {Array<string>} Array of [currentTerm, nextTerm], or [currentTerm] if next term calculation fails
 * 
 * @example
 * getCurrentAndNextTerms('2025-1')  // returns ['2025-1', '2025-2']
 * getCurrentAndNextTerms('2025-2')  // returns ['2025-2', '2026-0']
 */
export function getCurrentAndNextTerms(currentTerm) {
  if (!currentTerm || typeof currentTerm !== 'string') {
    return [];
  }
  
  const nextTerm = getNextTerm(currentTerm);
  
  if (nextTerm) {
    return [currentTerm, nextTerm];
  } else {
    // If we can't calculate next term, just return current
    return [currentTerm];
  }
}

/**
 * Filter available terms to find the next term after current
 * 
 * This is useful when you have a list of available terms from AISIS
 * and want to find which one is the "next" term after the current one.
 * 
 * @param {Array<{value: string, label: string, selected: boolean}>} availableTerms - Terms from AISIS dropdown
 * @param {string} currentTerm - Current term code
 * @returns {string|null} Next available term, or null if not found
 * 
 * @example
 * const terms = [
 *   { value: '2025-1', label: '2025-2026-First Semester', selected: true },
 *   { value: '2025-2', label: '2025-2026-Second Semester', selected: false },
 *   { value: '2026-0', label: '2026-2027-Intersession', selected: false }
 * ];
 * findNextAvailableTerm(terms, '2025-1')  // returns '2025-2'
 */
export function findNextAvailableTerm(availableTerms, currentTerm) {
  if (!availableTerms || !Array.isArray(availableTerms) || !currentTerm) {
    return null;
  }
  
  const expectedNextTerm = getNextTerm(currentTerm);
  if (!expectedNextTerm) {
    return null;
  }
  
  // Check if the expected next term exists in available terms
  const found = availableTerms.find(t => t.value === expectedNextTerm);
  return found ? found.value : null;
}

/**
 * Parse a term code into its components
 * 
 * @param {string} termCode - Term code (e.g., '2025-1')
 * @returns {{year: number, semester: number}|null} Parsed components or null if invalid
 */
export function parseTermCode(termCode) {
  if (!termCode || typeof termCode !== 'string') {
    return null;
  }
  
  const parts = termCode.split('-');
  if (parts.length !== 2) {
    return null;
  }
  
  const year = parseInt(parts[0], 10);
  const semester = parseInt(parts[1], 10);
  
  if (isNaN(year) || isNaN(semester)) {
    return null;
  }
  
  return { year, semester };
}

/**
 * Get a human-readable label for a semester number
 * 
 * @param {number} semester - Semester number (0, 1, or 2)
 * @returns {string} Human-readable label
 */
export function getSemesterLabel(semester) {
  switch (semester) {
    case 0:
      return 'Intersession';
    case 1:
      return 'First Semester';
    case 2:
      return 'Second Semester';
    default:
      return `Semester ${semester}`;
  }
}

/**
 * Format a term code as a human-readable string
 * 
 * @param {string} termCode - Term code (e.g., '2025-1')
 * @returns {string} Human-readable format (e.g., '2025-2026 First Semester')
 */
export function formatTermLabel(termCode) {
  const parsed = parseTermCode(termCode);
  if (!parsed) {
    return termCode;
  }
  
  const { year, semester } = parsed;
  const semesterLabel = getSemesterLabel(semester);
  
  // Academic year spans two calendar years (e.g., 2025-2026)
  return `${year}-${year + 1} ${semesterLabel}`;
}
