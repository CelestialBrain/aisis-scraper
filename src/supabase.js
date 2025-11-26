// Add this import at the top
import fetch from 'node-fetch';
import { validateScheduleRecord, isHeaderLikeRecord, SAMPLE_INVALID_RECORDS_COUNT } from './constants.js';

// Constants for sync operations
const MULTI_PROGRAM_LABEL = 'MULTI_PROGRAM';
const ALL_DEPARTMENTS_LABEL = 'ALL';

/**
 * Split an array into chunks of specified size
 * @param {Array} items - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array<Array>} Array of chunks
 */
export function chunkArray(items, size) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('size must be a positive integer');
  }
  
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process items with limited concurrency
 * @param {Array} items - Items to process
 * @param {number} concurrency - Maximum concurrent operations
 * @param {Function} fn - Async function to call for each item
 * @returns {Promise<Array>} Array of results
 */
export async function processWithConcurrency(items, concurrency, fn) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('concurrency must be a positive integer');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  
  const results = [];
  const executing = new Set();
  
  for (const [index, item] of items.entries()) {
    const promise = fn(item, index).then(result => {
      executing.delete(promise);
      return result;
    });
    
    results.push(promise);
    executing.add(promise);
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

export { ALL_DEPARTMENTS_LABEL };

export class SupabaseManager {
  constructor(ingestToken, supabaseUrl = null) {
    this.ingestToken = ingestToken;
    // Read from environment variable or fallback to parameter or default
    const baseUrl = supabaseUrl || process.env.SUPABASE_URL || 'https://npnringvuiystpxbntvj.supabase.co';
    this.url = `${baseUrl}/functions/v1/github-data-ingest`;
  }

  /**
   * Parse and validate batch size from environment variable
   * @param {string} envVarName - Name of the environment variable
   * @param {number} defaultValue - Default value if not set or invalid
   * @returns {number} Validated batch size
   */
  _parseBatchSize(envVarName, defaultValue) {
    const envValue = parseInt(process.env[envVarName] || '', 10);
    return !isNaN(envValue) && envValue > 0 ? envValue : defaultValue;
  }

  async syncToSupabase(dataType, data, termCode = null, department = null, programCode = null) {
    console.log(`   ☁️ Supabase: Syncing ${data.length} ${dataType} records...`);

    // Defensive: ensure each record has necessary metadata if missing
    const normalizedData = data.map(record => {
      const enriched = { ...record };
      if (dataType === 'schedules' && termCode && !record.term_code) {
        enriched.term_code = termCode;
      }
      if (dataType === 'curriculum' && programCode && !record.program_code) {
        enriched.program_code = programCode;
      }
      return enriched;
    });

    // Client-side batching: configurable batch size to optimize performance
    // Larger batches reduce HTTP overhead and total sync time
    // Edge function further splits into DB batches internally
    // Default: 2000 records per batch (reduced from 500 for better performance)
    // Can be configured via SUPABASE_CLIENT_BATCH_SIZE environment variable
    const defaultBatchSize = 2000;
    const CLIENT_BATCH_SIZE = this._parseBatchSize('SUPABASE_CLIENT_BATCH_SIZE', defaultBatchSize);
    const totalRecords = normalizedData.length;
    const batches = [];
    
    for (let i = 0; i < totalRecords; i += CLIENT_BATCH_SIZE) {
      batches.push(normalizedData.slice(i, i + CLIENT_BATCH_SIZE));
    }

    console.log(`   📦 Split into ${batches.length} client-side batch(es) of up to ${CLIENT_BATCH_SIZE} records each`);
    
    const customBatchSize = process.env.SUPABASE_CLIENT_BATCH_SIZE;
    if (customBatchSize && !isNaN(parseInt(customBatchSize, 10)) && parseInt(customBatchSize, 10) > 0) {
      console.log(`   ℹ️  Using custom batch size from SUPABASE_CLIENT_BATCH_SIZE: ${CLIENT_BATCH_SIZE}`);
    }

    let successCount = 0;
    let failureCount = 0;

    // Track first batch for term-based replace_existing logic
    // For schedules: only the first batch should delete existing records (replace_existing=true)
    // Subsequent batches should append/upsert (replace_existing=false) to avoid data loss
    let isFirstBatchForTerm = true;

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;
      
      console.log(`   📤 Sending batch ${batchNum}/${batches.length} (${batch.length} records) to Supabase...`);
      
      // For schedules data type, control replace_existing behavior per batch
      // Only first batch deletes old data, subsequent batches append
      // For other data types, pass null to omit replace_existing from metadata
      const replaceExisting = (dataType === 'schedules') ? isFirstBatchForTerm : null;
      
      if (dataType === 'schedules' && isFirstBatchForTerm) {
        console.log(`   🔄 First batch for term ${termCode}: replace_existing=true (will clear old data)`);
      } else if (dataType === 'schedules' && !isFirstBatchForTerm) {
        console.log(`   ➕ Subsequent batch: replace_existing=false (append mode)`);
      }
      
      const success = await this.sendRequest(dataType, batch, termCode, department, programCode, replaceExisting);
      
      if (success) {
        successCount += batch.length;
        console.log(`   ✅ Batch ${batchNum}/${batches.length}: Successfully synced ${batch.length} records`);
        
        // After first successful batch, disable replace_existing for remaining batches
        if (isFirstBatchForTerm) {
          isFirstBatchForTerm = false;
        }
      } else {
        failureCount += batch.length;
        console.error(`   ⚠️ Batch ${batchNum}/${batches.length}: Failed to sync ${batch.length} records`);
      }
    }

    // Summary
    console.log(`\n   📊 Sync Summary:`);
    console.log(`      Total records: ${totalRecords}`);
    console.log(`      Successful: ${successCount}`);
    console.log(`      Failed: ${failureCount}`);
    console.log(`      Batches: ${batches.length}`);
    
    // Enhanced: Show per-department breakdown
    if (dataType === 'schedules' && normalizedData.length > 0) {
      const deptCounts = {};
      for (const record of normalizedData) {
        const dept = record.department || 'UNKNOWN';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      }
      
      const sortedDepts = Object.entries(deptCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10 departments
      
      if (sortedDepts.length > 0) {
        console.log(`\n      📋 Top ${sortedDepts.length} Departments by Record Count:`);
        for (const [dept, count] of sortedDepts) {
          console.log(`         ${dept.padEnd(20)}: ${count.toString().padStart(4)} records`);
        }
        
        if (Object.keys(deptCounts).length > 10) {
          console.log(`         ... and ${Object.keys(deptCounts).length - 10} more departments`);
        }
        
        console.log(`         Total departments: ${Object.keys(deptCounts).length}`);
      }
    }
    
    console.log(); // Empty line for readability
    
    if (failureCount === 0) {
      console.log(`   ✅ Supabase: All ${totalRecords} records synced successfully`);
      return true;
    } else if (successCount > 0) {
      console.log(`   ⚠️ Supabase: Partial success - ${successCount}/${totalRecords} records synced`);
      return false;
    } else {
      console.error(`   ❌ Supabase: All batches failed - 0/${totalRecords} records synced`);
      return false;
    }
  }

  /**
   * Build metadata object with GitHub Actions context and custom fields.
   * 
   * @param {string|null} termCode - Term code for schedules
   * @param {string|null} department - Department code
   * @param {string|null} programCode - Program code for curriculum
   * @param {number|null} recordCount - Number of records in the payload
   * @param {boolean|null} replaceExisting - Whether to replace existing records (schedules only)
   * @returns {Object} Metadata object with all available context
   */
  buildMetadata(termCode = null, department = null, programCode = null, recordCount = null, replaceExisting = null) {
    const metadata = {};
    
    // Add context-specific metadata
    if (termCode) metadata.term_code = termCode;
    if (department) metadata.department = department;
    if (programCode) metadata.program_code = programCode;
    if (recordCount !== null) metadata.record_count = recordCount;
    // Only add replace_existing if explicitly set (null means omit from metadata)
    if (replaceExisting != null) {
      metadata.replace_existing = replaceExisting;
    }
    
    // Add GitHub Actions context if available
    if (process.env.GITHUB_WORKFLOW) {
      metadata.workflow_name = process.env.GITHUB_WORKFLOW;
    }
    if (process.env.GITHUB_RUN_ID) {
      metadata.run_id = process.env.GITHUB_RUN_ID;
    }
    if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
      metadata.run_url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    }
    if (process.env.GITHUB_REPOSITORY) {
      metadata.repository = process.env.GITHUB_REPOSITORY;
    }
    if (process.env.GITHUB_SHA) {
      metadata.commit_sha = process.env.GITHUB_SHA;
    }
    
    // Determine trigger type
    if (process.env.GITHUB_EVENT_NAME === 'schedule') {
      metadata.trigger = 'schedule';
    } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      metadata.trigger = 'manual';
    } else if (process.env.GITHUB_ACTIONS) {
      metadata.trigger = 'github-actions';
    } else {
      metadata.trigger = 'manual';
    }
    
    return metadata;
  }

  /**
   * Send a request to Supabase Edge Function with retry logic.
   * Retries on network errors and 5xx status codes with exponential backoff.
   * 
   * Retry behavior:
   * - Retries on: network errors (exceptions), 500, 502, 503, 504, 522, 524
   * - Backoff: exponential with cap (1s, 2s, 4s, 8s, 16s, 32s)
   * - Max retries: 5 (total time: ~63 seconds max)
   * - Logs each retry attempt with status and message
   * 
   * @param {string} dataType - Type of data ('schedules', 'curriculum', or 'courses')
   * @param {Array} records - Array of records to send
   * @param {string|null} termCode - Term code for schedules
   * @param {string|null} department - Department code
   * @param {string|null} programCode - Program code for curriculum
   * @param {boolean|null} replaceExisting - Whether to replace existing records (schedules only)
   * @returns {Promise<boolean>} True if successful, false if all retries failed
   */
  async sendRequest(dataType, records, termCode = null, department = null, programCode = null, replaceExisting = null) {
    // Build metadata with GitHub Actions context, record count, and replace_existing flag
    const metadata = this.buildMetadata(termCode, department, programCode, records.length, replaceExisting);

    const payload = {
      data_type: dataType,
      records: records,
      metadata: metadata
    };

    // Retry configuration
    const MAX_RETRIES = 5;
    const INITIAL_DELAY_MS = 1000; // 1 second
    const MAX_DELAY_MS = 32000; // 32 seconds cap
    const RETRYABLE_STATUS_CODES = [500, 502, 503, 504, 522, 524];
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.ingestToken}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          if (attempt > 0) {
            console.log(`   ✅ Request succeeded on retry attempt ${attempt}`);
          }
          
          // Parse and log response for better visibility
          try {
            const responseData = await response.json();
            if (responseData.inserted !== undefined) {
              console.log(`   📊 Edge function response: ${responseData.inserted}/${responseData.total || records.length} records upserted`);
            }
          } catch (e) {
            // Response might not be JSON, that's ok
          }
          
          return true;
        } else {
          const text = await response.text();
          const isRetryable = RETRYABLE_STATUS_CODES.includes(response.status);
          
          if (isRetryable && attempt < MAX_RETRIES) {
            const delayMs = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
            const message = text.substring(0, 100); // Truncate for logging
            console.log(`   ⚠️ Retry ${attempt + 1}/${MAX_RETRIES}: HTTP ${response.status} - ${message}`);
            console.log(`   ⏳ Waiting ${delayMs / 1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          } else {
            console.error(`   ❌ Supabase Error: ${response.status} - ${text}`);
            return false;
          }
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          const delayMs = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
          console.log(`   ⚠️ Retry ${attempt + 1}/${MAX_RETRIES}: Network error - ${error.message}`);
          console.log(`   ⏳ Waiting ${delayMs / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          console.error(`   ❌ Supabase Exception (all retries exhausted):`, error.message);
          return false;
        }
      }
    }

    // Should not reach here, but just in case
    console.error(`   ❌ Supabase: All retry attempts failed`);
    return false;
  }

  safeInt(val) {
    if (!val || val === '') return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  safeFloat(val) {
    if (!val || val === '') return 0.0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0.0 : parsed;
  }

  transformScheduleData(scheduleItems) {
    const transformed = [];
    const invalidRecordSamples = [];
    const headerRecordSamples = [];
    let totalHeadersFiltered = 0;
    let totalInvalidFiltered = 0;
    
    for (const item of scheduleItems) {
      // Transform schedule item, excluding unused time/delivery fields
      // Note: start_time, end_time, days_of_week, and delivery_mode are not meaningfully
      // populated by the scraper (always defaults/empty) so we exclude them from the export
      const record = {
        subject_code: item.subjectCode,
        section: item.section,
        course_title: item.title, 
        units: this.safeFloat(item.units),
        time_pattern: item.time,
        room: item.room,
        instructor: item.instructor,
        department: item.department,
        language: item.language,
        level: item.level,
        remarks: item.remarks,
        max_capacity: this.safeInt(item.maxSlots),
        term_code: item.term_code  // Preserve term_code from enriched record
      };
      
      // Check for header/placeholder rows
      if (isHeaderLikeRecord(record)) {
        totalHeadersFiltered++;
        if (headerRecordSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
          headerRecordSamples.push({
            subject_code: record.subject_code,
            section: record.section,
            course_title: record.course_title
          });
        }
        continue;
      }
      
      // Validate required fields
      if (!validateScheduleRecord(record)) {
        totalInvalidFiltered++;
        if (invalidRecordSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
          invalidRecordSamples.push({
            subject_code: record.subject_code,
            section: record.section,
            department: record.department,
            term_code: record.term_code,
            reason: 'missing required fields'
          });
        }
        continue;
      }
      
      transformed.push(record);
    }
    
    // Log validation results if any records were filtered
    if (totalHeadersFiltered > 0) {
      console.log(`   ℹ️  Filtered ${totalHeadersFiltered} header/placeholder record(s)`);
      if (process.env.DEBUG_SCRAPER === 'true' && headerRecordSamples.length > 0) {
        console.log(`   🔍 Sample header records (showing ${headerRecordSamples.length}):`, headerRecordSamples);
      }
    }
    
    if (totalInvalidFiltered > 0) {
      console.log(`   ⚠️  Filtered ${totalInvalidFiltered} invalid record(s) (missing required fields)`);
      if (invalidRecordSamples.length > 0) {
        console.log(`   📋 Sample invalid records (showing ${invalidRecordSamples.length}):`, invalidRecordSamples);
      }
    }
    
    return transformed;
  }

  transformCurriculumData(curriculumItems) {
    return curriculumItems.map(item => {
      return {
        degree_code: item.degree,
        year_level: item.yearLevel,
        semester: item.semester,
        course_code: item.courseCode,
        course_description: item.description,
        units: this.safeFloat(item.units),
        category: item.category || 'CORE'
      };
    });
  }

  /**
   * Transform courses data for the courses table
   * This is for generic course catalog data (not schedule-specific)
   */
  transformCoursesData(courseItems) {
    return courseItems.map(item => {
      return {
        course_code: item.courseCode || item.course_code,
        course_title: item.title || item.course_title,
        units: this.safeFloat(item.units),
        description: item.description || null,
        school_id: item.school_id || 'ADMU', // Default to Ateneo
        department: item.department || null,
        level: item.level || null
      };
    });
  }

  /**
   * Transform a curriculum course row to match the Supabase schema
   * @private
   * @param {Object} row - Course row object
   * @returns {Object} Transformed course object
   */
  _transformCurriculumCourse(row) {
    return {
      degree_code: row.deg_code,
      program_label: row.program_label,
      program_title: row.program_title,
      year_level: row.year_level,
      semester: row.semester,
      course_code: row.course_code,
      course_title: row.course_title,
      units: row.units,
      prerequisites: row.prerequisites,
      category: row.category
    };
  }

  /**
   * Send curriculum batch(es) to Supabase
   * 
   * Supports two modes:
   * 1. Single batch: Send one program/version (original behavior)
   * 2. Grouped batches: Send multiple programs in one HTTP request (new behavior)
   * 
   * @param {Object|Array<Object>} batchOrBatches - Single batch object or array of batch objects
   * @param {string} batchOrBatches.deg_code - Degree code (e.g., "BS CS_2024_1")
   * @param {string} batchOrBatches.program_code - Program code (e.g., "BS CS")
   * @param {string} batchOrBatches.curriculum_version - Curriculum version (e.g., "2024_1")
   * @param {Array<Object>} batchOrBatches.courses - Array of course objects
   * @param {Object} batchOrBatches.metadata - Metadata object with counts and observability info
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async sendCurriculumBatch(batchOrBatches) {
    // Handle both single batch and array of batches
    const batches = Array.isArray(batchOrBatches) ? batchOrBatches : [batchOrBatches];
    
    if (batches.length === 0) {
      console.warn(`   ⚠️ Skipping empty batch array`);
      return false;
    }
    
    // Single batch mode (original behavior)
    if (batches.length === 1) {
      const { deg_code, program_code, curriculum_version, courses, metadata } = batches[0];

      if (!deg_code || !courses || courses.length === 0) {
        console.warn(`   ⚠️ Skipping empty batch for ${deg_code || 'unknown program'}`);
        return false;
      }

      console.log(`   📤 Sending batch for ${deg_code}...`);
      console.log(`      Program: ${program_code}, Version: ${curriculum_version}`);
      console.log(`      Courses: ${courses.length}`);
      console.log(`      Metadata: scraped=${metadata.total_courses_scraped}, deduped=${metadata.deduplication_removed}, invalid=${metadata.invalid_courses_count}`);

      // Transform courses to match the Supabase schema
      const transformedCourses = courses.map(row => this._transformCurriculumCourse(row));

      // Build the payload with program-level grouping
      const payload = {
        data_type: 'curriculum',
        records: transformedCourses,
        metadata: {
          ...metadata,
          // Add GitHub Actions context
          ...this.buildMetadata(null, null, program_code, courses.length)
        }
      };

      try {
        const response = await fetch(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.ingestToken}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          try {
            const responseData = await response.json();
            if (responseData.inserted !== undefined) {
              console.log(`   ✅ ${deg_code}: ${responseData.inserted}/${responseData.total || courses.length} records upserted`);
            } else {
              console.log(`   ✅ ${deg_code}: Batch sent successfully`);
            }
          } catch (e) {
            // Response might not be JSON, that's ok
            console.log(`   ✅ ${deg_code}: Batch sent successfully`);
          }
          return true;
        } else {
          const text = await response.text();
          console.error(`   ❌ ${deg_code}: Supabase Error: ${response.status} - ${text.substring(0, 200)}`);
          return false;
        }
      } catch (error) {
        console.error(`   ❌ ${deg_code}: Network error: ${error.message}`);
        return false;
      }
    }
    
    // Grouped batches mode (new behavior)
    // Aggregate all courses and metadata from multiple programs into a single request
    let totalCoursesScraped = 0;
    let totalDeduplicationRemoved = 0;
    let totalInvalidCourses = 0;
    let totalCourses = 0;
    const allTransformedCourses = [];
    const programCodes = [];
    
    for (const batch of batches) {
      const { deg_code, courses, metadata } = batch;
      
      if (!deg_code || !courses || courses.length === 0) {
        console.warn(`   ⚠️ Skipping empty batch for ${deg_code || 'unknown program'} in group`);
        continue;
      }
      
      programCodes.push(deg_code);
      totalCourses += courses.length;
      totalCoursesScraped += metadata.total_courses_scraped || courses.length;
      totalDeduplicationRemoved += metadata.deduplication_removed || 0;
      totalInvalidCourses += metadata.invalid_courses_count || 0;
      
      // Transform and collect courses
      const transformedCourses = courses.map(row => this._transformCurriculumCourse(row));
      
      allTransformedCourses.push(...transformedCourses);
    }
    
    if (allTransformedCourses.length === 0) {
      console.warn(`   ⚠️ No valid courses in grouped batch`);
      return false;
    }
    
    console.log(`   📤 Sending grouped batch...`);
    console.log(`      Programs: ${batches.length}`);
    console.log(`      Total courses: ${totalCourses}`);
    console.log(`      Metadata: scraped=${totalCoursesScraped}, deduped=${totalDeduplicationRemoved}, invalid=${totalInvalidCourses}`);
    
    // Build aggregated metadata
    const aggregatedMetadata = {
      total_programs: batches.length,
      total_courses_scraped: totalCoursesScraped,
      deduplication_removed: totalDeduplicationRemoved,
      invalid_courses_count: totalInvalidCourses,
      program_codes: programCodes,
      // Add GitHub Actions context with synthetic label
      ...this.buildMetadata(null, null, MULTI_PROGRAM_LABEL, totalCourses)
    };
    
    // Build the payload
    const payload = {
      data_type: 'curriculum',
      records: allTransformedCourses,
      metadata: aggregatedMetadata
    };
    
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.ingestToken}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        try {
          const responseData = await response.json();
          if (responseData.inserted !== undefined) {
            console.log(`   ✅ Grouped batch: ${responseData.inserted}/${responseData.total || totalCourses} records upserted`);
          } else {
            console.log(`   ✅ Grouped batch sent successfully`);
          }
        } catch (e) {
          // Response might not be JSON, that's ok
          console.log(`   ✅ Grouped batch sent successfully`);
        }
        return true;
      } else {
        const text = await response.text();
        console.error(`   ❌ Grouped batch: Supabase Error: ${response.status} - ${text.substring(0, 200)}`);
        return false;
      }
    } catch (error) {
      console.error(`   ❌ Grouped batch: Network error: ${error.message}`);
      return false;
    }
  }
}
