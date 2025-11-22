// Edge Function: github-data-ingest
// Receives scraped data from the AISIS scraper and syncs it to the database
// Implements batched upsert logic to prevent 504 timeouts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Constants
// DB batch size - configurable via environment variable for performance tuning
// Default: 100 records per DB transaction
// Range: 50-500 (enforced for safety)
// Larger batches = faster but more risk of timeout, smaller = slower but more reliable
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;

// Parse batch size from environment with bounds checking
function getBatchSize(): number {
  const envValue = Deno.env.get('GITHUB_INGEST_DB_BATCH_SIZE');
  if (!envValue) {
    return DEFAULT_BATCH_SIZE;
  }
  
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid GITHUB_INGEST_DB_BATCH_SIZE: "${envValue}", using default ${DEFAULT_BATCH_SIZE}`);
    return DEFAULT_BATCH_SIZE;
  }
  
  // Clamp to valid range
  if (parsed < MIN_BATCH_SIZE) {
    console.warn(`GITHUB_INGEST_DB_BATCH_SIZE ${parsed} below minimum ${MIN_BATCH_SIZE}, using minimum`);
    return MIN_BATCH_SIZE;
  }
  
  if (parsed > MAX_BATCH_SIZE) {
    console.warn(`GITHUB_INGEST_DB_BATCH_SIZE ${parsed} above maximum ${MAX_BATCH_SIZE}, using maximum`);
    return MAX_BATCH_SIZE;
  }
  
  console.log(`Using custom DB batch size: ${parsed}`);
  return parsed;
}

const BATCH_SIZE = getBatchSize();
const ONCONFLICT_SCHEDULES = 'term_code,subject_code,section,department'; // Matches DB unique constraint

// Interfaces
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

interface CurriculumRecord {
  degree_code: string;
  year_level?: number;
  semester?: number;
  course_code: string;
  course_description?: string;
  units?: number;
  category?: string;
}

interface IngestPayload {
  data_type: 'schedules' | 'curriculum';
  records: ScheduleRecord[] | CurriculumRecord[];
  metadata?: {
    term_code?: string;
    department?: string;
  };
}

interface BatchResult {
  inserted: number;
  errors: string[];
}

// Helper: Add delay between batches to avoid rate limits
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
async function upsertSchedulesInBatches(
  supabase: any,
  schedules: ScheduleRecord[],
  batchSize: number = BATCH_SIZE
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: []
  };

  // Filter out invalid records
  const validSchedules = schedules.filter(validateScheduleRecord);
  const invalidCount = schedules.length - validSchedules.length;
  
  if (invalidCount > 0) {
    result.errors.push(`Filtered out ${invalidCount} invalid records (missing required fields)`);
  }

  // Process in batches
  for (let i = 0; i < validSchedules.length; i += batchSize) {
    const batch = validSchedules.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(validSchedules.length / batchSize);

    console.log(`Processing batch ${batchIndex}/${totalBatches} (${batch.length} records)...`);

    try {
      const { error, count } = await supabase
        .from('aisis_schedules')
        .upsert(batch, {
          onConflict: ONCONFLICT_SCHEDULES,
          count: 'exact'
        });

      if (error) {
        const errorMsg = `Batch ${batchIndex} failed: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      } else {
        const insertedCount = count ?? batch.length;
        result.inserted += insertedCount;
        console.log(`Batch ${batchIndex} completed: ${insertedCount} records upserted`);
      }
    } catch (err) {
      const errorMsg = `Batch ${batchIndex} exception: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }

    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < validSchedules.length) {
      await delay(100);
    }
  }

  return result;
}

// Helper: Upsert curriculum records
async function upsertCurriculum(
  supabase: any,
  curriculum: CurriculumRecord[]
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: []
  };

  // Curriculum typically has fewer records, but we still batch for consistency
  const batchSize = 500;

  for (let i = 0; i < curriculum.length; i += batchSize) {
    const batch = curriculum.slice(i, i + batchSize);

    try {
      const { error, count } = await supabase
        .from('aisis_curriculum')
        .upsert(batch, {
          onConflict: 'degree_code,course_code',
          count: 'exact'
        });

      if (error) {
        const errorMsg = `Curriculum batch failed: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      } else {
        result.inserted += count ?? batch.length;
      }
    } catch (err) {
      const errorMsg = `Curriculum batch exception: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

// Main handler
serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for full access
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

    // Parse request body
    const payload: IngestPayload = await req.json();
    const { data_type, records, metadata } = payload;

    console.log(`Received ${data_type} data: ${records.length} records`);
    if (metadata) {
      console.log(`Metadata:`, metadata);
    }

    let result: BatchResult;

    // Route to appropriate handler based on data type
    if (data_type === 'schedules') {
      result = await upsertSchedulesInBatches(
        supabaseClient,
        records as ScheduleRecord[]
      );

      console.log(`Schedules sync completed: ${result.inserted}/${records.length} inserted`);
      
      if (result.errors.length > 0) {
        console.error(`Encountered ${result.errors.length} errors during sync`);
      }

      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          inserted: result.inserted,
          total: records.length,
          errors: result.errors,
          partial_success: result.inserted > 0 && result.errors.length > 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.errors.length === 0 ? 200 : (result.inserted > 0 ? 207 : 500)
        }
      );

    } else if (data_type === 'curriculum') {
      result = await upsertCurriculum(
        supabaseClient,
        records as CurriculumRecord[]
      );

      console.log(`Curriculum sync completed: ${result.inserted}/${records.length} inserted`);

      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          inserted: result.inserted,
          total: records.length,
          errors: result.errors
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.errors.length === 0 ? 200 : 500
        }
      );

    } else {
      throw new Error(`Unknown data_type: ${data_type}`);
    }

  } catch (error) {
    console.error('Error in github-data-ingest:', error);
    
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
