// Add this import at the top
import fetch from 'node-fetch';

export class SupabaseManager {
  constructor(ingestToken, supabaseUrl = null) {
    this.ingestToken = ingestToken;
    // Read from environment variable or fallback to parameter or default
    const baseUrl = supabaseUrl || process.env.SUPABASE_URL || 'https://npnringvuiystpxbntvj.supabase.co';
    this.url = `${baseUrl}/functions/v1/github-data-ingest`;
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

    // Client-side batching: split into 500-record chunks to avoid 504 timeouts
    // 500 is chosen as a balance between:
    // - Small enough to stay under edge function timeout limits (~30s max)
    // - Large enough to minimize HTTP request overhead
    // - Edge function further splits into 100-record DB batches (5 per client batch)
    const CLIENT_BATCH_SIZE = 500;
    const totalRecords = normalizedData.length;
    const batches = [];
    
    for (let i = 0; i < totalRecords; i += CLIENT_BATCH_SIZE) {
      batches.push(normalizedData.slice(i, i + CLIENT_BATCH_SIZE));
    }

    console.log(`   📦 Split into ${batches.length} client-side batch(es) of up to ${CLIENT_BATCH_SIZE} records each`);

    let successCount = 0;
    let failureCount = 0;

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;
      
      console.log(`   📤 Sending batch ${batchNum}/${batches.length} (${batch.length} records) to Supabase...`);
      
      const success = await this.sendRequest(dataType, batch, termCode, department, programCode);
      
      if (success) {
        successCount += batch.length;
        console.log(`   ✅ Batch ${batchNum}/${batches.length}: Successfully synced ${batch.length} records`);
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
    console.log(`      Batches: ${batches.length}\n`);
    
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
   * @returns {Object} Metadata object with all available context
   */
  buildMetadata(termCode = null, department = null, programCode = null) {
    const metadata = {};
    
    // Add context-specific metadata
    if (termCode) metadata.term_code = termCode;
    if (department) metadata.department = department;
    if (programCode) metadata.program_code = programCode;
    
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
   * @returns {Promise<boolean>} True if successful, false if all retries failed
   */
  async sendRequest(dataType, records, termCode = null, department = null, programCode = null) {
    // Build metadata with GitHub Actions context
    const metadata = this.buildMetadata(termCode, department, programCode);

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

  parseTimePattern(timePattern) {
    if (!timePattern) return { start: null, end: null, days: null };
    try {
      const timeMatch = timePattern.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      if (!timeMatch) return { start: null, end: null, days: null };
      
      const [_, startTime, endTime] = timeMatch;
      const formatTime = (time) => {
        const [hours, minutes] = time.split(':');
        return `${hours.padStart(2, '0')}:${minutes}:00`;
      };
      
      const dayPattern = timePattern.split(' ')[0].toUpperCase();
      const days = [];
      if (dayPattern.includes('TH')) days.push(4);
      else if (dayPattern.includes('T')) days.push(2);
      if (dayPattern.includes('M')) days.push(1);
      if (dayPattern.includes('W')) days.push(3);
      if (dayPattern.includes('F')) days.push(5);
      if (dayPattern.includes('S') && !dayPattern.includes('U')) days.push(6);
      if (dayPattern.includes('SU')) days.push(0);

      return {
        start: formatTime(startTime),
        end: formatTime(endTime),
        days: days.length > 0 ? days : null
      };
    } catch (error) {
      return { start: null, end: null, days: null };
    }
  }

  transformScheduleData(scheduleItems) {
    return scheduleItems.map(item => {
      const parsedTime = this.parseTimePattern(item.time);  // Fix: use item.time not item.time_pattern
      
      return {
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
        
        start_time: parsedTime.start || '00:00:00', 
        end_time: parsedTime.end || '23:59:59',     
        days_of_week: parsedTime.days ? JSON.stringify(parsedTime.days) : '[]', 
        delivery_mode: null,
        term_code: item.term_code  // Preserve term_code from enriched record
      };
    });
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
}
