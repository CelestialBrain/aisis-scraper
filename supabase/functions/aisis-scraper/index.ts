// Edge Function: aisis-scraper
// Main AISIS scraper Edge Function
// Scrapes schedule data and syncs to database with batched upserts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Constants - matches database unique constraint
const ONCONFLICT_SCHEDULES = 'term_code,subject_code,section,department';
const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 100;
const SAMPLE_INVALID_RECORDS_COUNT = 3;

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

interface BatchResult {
  inserted: number;
  errors: string[];
}

// Helper: Add delay between batches
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Validate schedule record has required fields
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

// Helper: Batch upsert schedules with proper error handling
// This replaces the old single giant insert with batched upserts
async function upsertSchedulesInBatches(
  client: any,
  schedules: ScheduleRecord[],
  jobId: string | null = null,
  batchSize: number = BATCH_SIZE
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: []
  };

  // Pre-validate schedules - filter out invalid records
  const validSchedules = schedules.filter(validateScheduleRecord);
  const invalidSchedules = schedules.filter(s => !validateScheduleRecord(s));
  const invalidCount = invalidSchedules.length;
  
  if (invalidCount > 0) {
    const warningMsg = `Filtered out ${invalidCount} invalid records (missing required fields)`;
    console.warn(warningMsg);
    result.errors.push(warningMsg);
    
    // Log sample invalid records for debugging
    const sampleInvalid = invalidSchedules.slice(0, SAMPLE_INVALID_RECORDS_COUNT).map(s => ({
      term_code: s.term_code || 'MISSING',
      subject_code: s.subject_code || 'MISSING',
      section: s.section || 'MISSING',
      department: s.department || 'MISSING'
    }));
    console.warn(`Sample invalid records:`, JSON.stringify(sampleInvalid, null, 2));
    
    // Optional: Log to a job log table if jobId is available
    if (jobId) {
      await recordLog(client, jobId, 'warning', warningMsg, { 
        invalid_count: invalidCount,
        sample_invalid: sampleInvalid
      });
    }
  }

  // Process in batches
  const totalBatches = Math.ceil(validSchedules.length / batchSize);
  
  for (let i = 0; i < validSchedules.length; i += batchSize) {
    const batch = validSchedules.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;

    console.log(`Processing batch ${batchIndex}/${totalBatches} (${batch.length} records)...`);

    try {
      // FIXED: Replaced single insert with batched upsert
      // Previous (incorrect): await serviceClient.from('aisis_schedules').insert(schedules)
      // Current (correct): Batched upsert with proper onConflict key
      const { error, count } = await client
        .from('aisis_schedules')
        .upsert(batch, {
          onConflict: ONCONFLICT_SCHEDULES,
          count: 'exact'
        });

      if (error) {
        const errorMsg = `Batch ${batchIndex} failed: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
        
        // Log sample records from failed batch for debugging
        const sampleBatch = batch.slice(0, 2).map(s => ({
          term_code: s.term_code,
          subject_code: s.subject_code,
          section: s.section,
          department: s.department
        }));
        console.error(`Sample records from failed batch:`, JSON.stringify(sampleBatch, null, 2));
        
        // Log error to job log if available
        if (jobId) {
          await recordLog(client, jobId, 'error', errorMsg, {
            batch_index: batchIndex,
            batch_size: batch.length,
            error_code: error.code,
            error_details: error.details,
            sample_records: sampleBatch
          });
        }
      } else {
        const insertedCount = count ?? batch.length;
        result.inserted += insertedCount;
        console.log(`Batch ${batchIndex} completed: ${insertedCount} records upserted`);
      }
    } catch (err) {
      const errorMsg = `Batch ${batchIndex} exception: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
      
      if (jobId) {
        await recordLog(client, jobId, 'error', errorMsg, {
          batch_index: batchIndex,
          batch_size: batch.length
        });
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < validSchedules.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return result;
}

// Helper: Record log entry (if a job_logs table exists)
async function recordLog(
  client: any,
  jobId: string,
  level: 'info' | 'warning' | 'error',
  message: string,
  metadata: any = {}
): Promise<void> {
  try {
    await client
      .from('job_logs')
      .insert({
        job_id: jobId,
        level: level,
        message: message,
        metadata: metadata,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    // Silently fail if job_logs table doesn't exist
    console.warn('Failed to record log:', err.message);
  }
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
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { 
      term_code, 
      department = 'ALL',
      schedules,
      job_id = null 
    } = await req.json();

    console.log(`AISIS Scraper: term=${term_code}, dept=${department}, schedules=${schedules?.length || 0}`);

    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          inserted: 0, 
          message: 'No schedules to sync' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log start of sync
    if (job_id) {
      await recordLog(serviceClient, job_id, 'info', 
        `Starting schedule sync for ${department}`, 
        { term_code, department, total_schedules: schedules.length }
      );
    }

    // Use batched upsert instead of single insert
    const results = await upsertSchedulesInBatches(
      serviceClient,
      schedules,
      job_id,
      BATCH_SIZE
    );

    // Log completion
    const success = results.errors.length === 0;
    const partialSuccess = results.inserted > 0 && results.errors.length > 0;

    if (job_id) {
      if (success) {
        await recordLog(serviceClient, job_id, 'info',
          `Successfully synced ${results.inserted} schedules for ${department}`,
          { term_code, department, inserted: results.inserted }
        );
      } else if (partialSuccess) {
        await recordLog(serviceClient, job_id, 'warning',
          `Partial sync for ${department}: ${results.inserted}/${schedules.length} synced`,
          { term_code, department, inserted: results.inserted, errors: results.errors }
        );
      } else {
        await recordLog(serviceClient, job_id, 'error',
          `Failed to sync schedules for ${department}`,
          { term_code, department, errors: results.errors }
        );
      }
    }

    console.log(`Scraper completed: ${results.inserted}/${schedules.length} schedules synced`);

    return new Response(
      JSON.stringify({
        success: success,
        partial_success: partialSuccess,
        inserted: results.inserted,
        attempted: schedules.length,
        errors: results.errors,
        term_code: term_code,
        department: department
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: success ? 200 : (partialSuccess ? 207 : 500)
      }
    );

  } catch (error) {
    console.error('Error in aisis-scraper:', error);
    
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
