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
