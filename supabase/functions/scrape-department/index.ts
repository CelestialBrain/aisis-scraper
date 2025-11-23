// Edge Function: scrape-department
// Scrapes schedule data for a specific department and syncs to database
// Fixed to use correct onConflict key matching the database unique constraint

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Constants - matches database unique constraint
const ONCONFLICT_SCHEDULES = 'term_code,subject_code,section,department';
const BATCH_SIZE = 100;

// Sample size for logging invalid records
const SAMPLE_INVALID_RECORDS_COUNT = 3;

// Common header/placeholder values
const HEADER_MARKERS = {
  SUBJECT_CODE: ['SUBJECT CODE', 'SUBJ CODE', 'CODE'],
  SECTION: ['SECTION', 'SEC'],
  COURSE_TITLE: ['COURSE TITLE', 'TITLE', 'COURSE'],
};

interface ScheduleRecord {
  term_code: string;
  subject_code: string;
  section: string;
  department: string;
  course_title?: string;
  units?: number;
  time_pattern?: string;
  start_time?: string;
  end_time?: string;
  days_of_week?: string;
  room?: string;
  instructor?: string;
  language?: string;
  level?: string;
  remarks?: string;
  max_capacity?: number;
  delivery_mode?: string | null;
}

// Helper: Check if a schedule record appears to be a header or placeholder row
function isHeaderLikeRecord(record: ScheduleRecord): boolean {
  if (!record) return true;
  
  const subjectCode = (record.subject_code || '').toUpperCase().trim();
  const courseTitle = (record.course_title || '').toUpperCase().trim();
  const section = (record.section || '').toUpperCase().trim();
  
  // Check for header marker values
  if (HEADER_MARKERS.SUBJECT_CODE.some(marker => subjectCode === marker)) return true;
  if (HEADER_MARKERS.SECTION.some(marker => section === marker)) return true;
  if (HEADER_MARKERS.COURSE_TITLE.some(marker => courseTitle === marker)) return true;
  
  // Check for obviously invalid patterns
  if (subjectCode === '' && courseTitle === '') return true;
  
  return false;
}

// Helper: Validate schedule record
function validateScheduleRecord(record: ScheduleRecord): boolean {
  return !!(
    record.term_code &&
    record.subject_code &&
    record.section &&
    record.department &&
    record.term_code.trim() !== '' &&
    record.subject_code.trim() !== '' &&
    record.section.trim() !== '' &&
    record.department.trim() !== ''
  );
}

// Main handler
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { department, term_code, schedules } = await req.json();

    console.log(`Scraping department: ${department}, term: ${term_code}, schedules: ${schedules?.length || 0}`);

    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: 'No schedules to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out header/placeholder records first
    const headerSamples: ScheduleRecord[] = [];
    let filteredHeaders = 0;
    const nonHeaderSchedules = schedules.filter(record => {
      if (isHeaderLikeRecord(record)) {
        filteredHeaders++;
        if (headerSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
          headerSamples.push(record);
        }
        return false;
      }
      return true;
    });

    if (filteredHeaders > 0) {
      console.log(`Filtered ${filteredHeaders} header/placeholder record(s)`);
      if (headerSamples.length > 0) {
        console.log(`Sample header records:`, JSON.stringify(headerSamples.slice(0, SAMPLE_INVALID_RECORDS_COUNT)));
      }
    }

    // Validate schedules
    const invalidSamples: ScheduleRecord[] = [];
    let filteredInvalid = 0;
    const validSchedules = nonHeaderSchedules.filter(record => {
      if (!validateScheduleRecord(record)) {
        filteredInvalid++;
        if (invalidSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
          invalidSamples.push(record);
        }
        return false;
      }
      return true;
    });

    if (filteredInvalid > 0) {
      console.log(`Filtered ${filteredInvalid} invalid record(s) (missing required fields)`);
      if (invalidSamples.length > 0) {
        console.log(`Sample invalid records:`, JSON.stringify(invalidSamples.slice(0, SAMPLE_INVALID_RECORDS_COUNT)));
      }
    }

    // Process in batches with correct onConflict key
    let totalInserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < validSchedules.length; i += BATCH_SIZE) {
      const batch = validSchedules.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // FIXED: Now uses complete onConflict key including 'department'
        // Previous (incorrect): 'subject_code,section,term_code'
        // Current (correct): 'term_code,subject_code,section,department'
        const { error, count } = await supabaseClient
          .from('aisis_schedules')
          .upsert(batch, {
            onConflict: ONCONFLICT_SCHEDULES,
            count: 'exact'
          });

        if (error) {
          const errorMsg = `Batch ${batchNum} failed: ${error.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        } else {
          totalInserted += count ?? batch.length;
          console.log(`Batch ${batchNum} completed: ${count ?? batch.length} records`);
        }
      } catch (err) {
        const errorMsg = `Batch ${batchNum} exception: ${err.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Department ${department} sync completed: ${totalInserted}/${validSchedules.length} inserted`);

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        inserted: totalInserted,
        total: schedules.length,
        valid: validSchedules.length,
        filtered_headers: filteredHeaders,
        filtered_invalid: filteredInvalid,
        errors: errors,
        department: department,
        term_code: term_code
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errors.length === 0 ? 200 : (totalInserted > 0 ? 207 : 500)
      }
    );

  } catch (error) {
    console.error('Error in scrape-department:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
