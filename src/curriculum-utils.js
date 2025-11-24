/**
 * Curriculum data utilities for deduplication, validation, and grouping
 * 
 * This module provides helper functions for processing curriculum data:
 * - Deduplicating courses based on canonical identifiers
 * - Validating course records for completeness
 * - Grouping courses by program and version
 * 
 * @module curriculum-utils
 */

import { normalizeCourseCode, applyCourseMappings } from './constants.js';

/**
 * Deduplicate courses based on canonical course code and other unique keys
 * 
 * Deduplication strategy:
 * - Primary key: normalized + mapped course code + program code + curriculum version
 * - Additional factors: year level, semester (if present)
 * - Curriculum data does NOT have sections (unlike schedules)
 * - Last occurrence wins (assumes later entries are more recent/correct)
 * 
 * @param {Array<Object>} courses - Array of course objects
 * @returns {Array<Object>} Deduplicated array of courses
 */
export function dedupeCourses(courses) {
  if (!courses || courses.length === 0) {
    return [];
  }

  // Use a Map to track unique courses
  // Key format: "deg_code|canonical_course_code|year_level|semester"
  // Note: No section in curriculum data (unlike schedules)
  const courseMap = new Map();

  for (const course of courses) {
    // Normalize and apply canonical mappings
    const normalizedCode = normalizeCourseCode(course.course_code || '');
    const canonicalCode = applyCourseMappings(normalizedCode);
    
    const degCode = course.deg_code || '';
    const yearLevel = course.year_level || 'null';
    const semester = course.semester || 'null';
    
    // Build unique key (no section for curriculum)
    const key = `${degCode}|${canonicalCode}|${yearLevel}|${semester}`;
    
    // Last occurrence wins - this overwrites any previous entry with same key
    courseMap.set(key, course);
  }

  return Array.from(courseMap.values());
}

/**
 * Validate that a course record has all required fields
 * 
 * @param {Object} course - Course record to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateCourse(course) {
  const errors = [];

  // Required fields validation
  if (!course.deg_code || course.deg_code.trim() === '') {
    errors.push('Missing or empty deg_code');
  }

  if (!course.course_code || course.course_code.trim() === '') {
    errors.push('Missing or empty course_code');
  }

  if (!course.course_title || course.course_title.trim() === '') {
    errors.push('Missing or empty course_title');
  }

  // Units should be a valid number (can be 0 for some courses like residency)
  if (course.units === undefined || course.units === null) {
    errors.push('Missing units');
  } else if (typeof course.units !== 'number' || isNaN(course.units)) {
    errors.push('Invalid units (not a number)');
  } else if (course.units < 0) {
    errors.push('Invalid units (negative value)');
  }

  // Year level and semester are optional but should be valid if present
  if (course.year_level !== null && course.year_level !== undefined) {
    if (typeof course.year_level !== 'number' || course.year_level < 1 || course.year_level > 4) {
      errors.push('Invalid year_level (must be 1-4 if present)');
    }
  }

  if (course.semester !== null && course.semester !== undefined) {
    if (typeof course.semester !== 'number' || (course.semester !== 1 && course.semester !== 2)) {
      errors.push('Invalid semester (must be 1 or 2 if present)');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Filter courses into valid and invalid sets
 * 
 * @param {Array<Object>} courses - Array of course objects
 * @returns {Object} Object with { valid: Course[], invalid: Array<{course, errors}> }
 */
export function filterValidCourses(courses) {
  const valid = [];
  const invalid = [];

  for (const course of courses) {
    const validation = validateCourse(course);
    if (validation.valid) {
      valid.push(course);
    } else {
      invalid.push({
        course,
        errors: validation.errors
      });
    }
  }

  return { valid, invalid };
}

/**
 * Group courses by program code and curriculum version
 * 
 * The deg_code format is: "PROGRAM_VERSION_SUFFIX"
 * Examples: "BS CS_2024_1", "BS ME_2025_1", "AB DS_2024_1"
 * 
 * This function groups courses by their full deg_code which includes
 * both the program and version information.
 * 
 * @param {Array<Object>} courses - Array of course objects
 * @returns {Map<string, Array<Object>>} Map where key is deg_code and value is array of courses
 */
export function groupByProgramVersion(courses) {
  const grouped = new Map();

  for (const course of courses) {
    const degCode = course.deg_code;
    
    if (!degCode) {
      console.warn('Course without deg_code encountered, skipping grouping:', course);
      continue;
    }

    if (!grouped.has(degCode)) {
      grouped.set(degCode, []);
    }

    grouped.get(degCode).push(course);
  }

  return grouped;
}

/**
 * Extract program code and version from deg_code
 * 
 * @param {string} degCode - Full degree code (e.g., "BS CS_2024_1")
 * @returns {Object} Object with { programCode, curriculumVersion }
 */
export function extractProgramInfo(degCode) {
  if (!degCode) {
    return { programCode: null, curriculumVersion: null };
  }

  // Split by underscore: "BS CS_2024_1" -> ["BS CS", "2024", "1"]
  const parts = degCode.split('_');
  
  if (parts.length >= 2) {
    return {
      programCode: parts[0],
      curriculumVersion: parts.slice(1).join('_') // Rejoin in case version has underscores
    };
  }

  // If no underscore, treat entire string as program code
  return {
    programCode: degCode,
    curriculumVersion: null
  };
}

/**
 * Build curriculum batch metadata for observability
 * 
 * @param {string} degCode - Degree code
 * @param {Array<Object>} allCoursesForProgram - All scraped courses before processing
 * @param {Array<Object>} validCourses - Valid courses after deduplication and validation
 * @param {number} duplicatesRemoved - Number of duplicates removed
 * @param {number} invalidCount - Number of invalid courses removed
 * @returns {Object} Metadata object
 */
export function buildBatchMetadata(degCode, allCoursesForProgram, validCourses, duplicatesRemoved, invalidCount) {
  const { programCode, curriculumVersion } = extractProgramInfo(degCode);

  return {
    program_code: programCode,
    curriculum_version: curriculumVersion,
    total_courses_scraped: allCoursesForProgram.length,
    raw_courses_count: allCoursesForProgram.length,
    deduplication_removed: duplicatesRemoved,
    invalid_courses_count: invalidCount,
    final_course_count: validCourses.length,
    scraped_at: new Date().toISOString(),
    source_url: 'https://aisis.ateneo.edu/J_VOFC.do'
  };
}
