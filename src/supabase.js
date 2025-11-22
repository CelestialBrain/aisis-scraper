// Add this import at the top
import fetch from 'node-fetch';

export class SupabaseManager {
  constructor(ingestToken) {
    this.ingestToken = ingestToken;
    this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-data-ingest';
  }

  async syncToSupabase(dataType, data, termCode = null, department = null) {
    console.log(`   ☁️ Supabase: Syncing ${data.length} ${dataType} records...`);

    // Defensive: ensure each record has term_code if missing
    const normalizedData = data.map(record => {
      if (dataType === 'schedules' && termCode && !record.term_code) {
        return { ...record, term_code: termCode };
      }
      return record;
    });

    // Send all records in a single HTTP request
    // The Edge Function handles internal batching (BATCH_SIZE=100) for database writes
    console.log(`   📤 Sending ${normalizedData.length} records to Supabase Edge Function...`);
    
    const success = await this.sendRequest(dataType, normalizedData, termCode, department);
    
    if (success) {
      console.log(`   ✅ Supabase: Successfully synced ${normalizedData.length} records`);
      return true;
    } else {
      console.error(`   ⚠️ Supabase: Sync failed for ${normalizedData.length} records`);
      return false;
    }
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
   * @param {string} dataType - Type of data ('schedules' or 'curriculum')
   * @param {Array} records - Array of records to send
   * @param {string|null} termCode - Term code for schedules
   * @param {string|null} department - Department code
   * @returns {Promise<boolean>} True if successful, false if all retries failed
   */
  async sendRequest(dataType, records, termCode = null, department = null) {
    const payload = {
      data_type: dataType,
      records: records,
      metadata: {
        term_code: termCode,
        department: department
      }
    };

    if (dataType === 'schedules') {
      payload.metadata.term_code = termCode;
      payload.metadata.department = department;
    }

    // Retry configuration
    const MAX_RETRIES = 5;
    const INITIAL_DELAY_MS = 1000; // 1 second
    const MAX_DELAY_MS = 32000; // 32 seconds cap
    const RETRYABLE_STATUS_CODES = [500, 502, 503, 504, 522, 524];

    let lastError = null;
    
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
        lastError = error;
        
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
}
