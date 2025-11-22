// Edge Function: import-schedules
// Imports schedule data from external sources (e.g., CSV, JSON files)
// Fixed to use upsert instead of insert to prevent duplicates on reruns

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Constants - matches database unique constraint
const ONCONFLICT_SCHEDULES = 'term_code,subject_code,section,department';
const BATCH_SIZE = 100;

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

    const { schedules, source = 'unknown' } = await req.json();

    console.log(`Importing schedules from ${source}: ${schedules?.length || 0} records`);

    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: 'No schedules to import' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate schedules
    const validSchedules = schedules.filter(validateScheduleRecord);
    const invalidCount = schedules.length - validSchedules.length;

    if (invalidCount > 0) {
      console.warn(`Filtered out ${invalidCount} invalid schedule records`);
    }

    // Process in batches with upsert
    let totalInserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < validSchedules.length; i += BATCH_SIZE) {
      const batch = validSchedules.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // FIXED: Changed from insert() to upsert() to prevent duplicates
        // Previous (incorrect): .insert(batch)
        // Current (correct): .upsert(batch, { onConflict: ... })
        const { error: insertError, count } = await supabaseClient
          .from('aisis_schedules')
          .upsert(batch, {
            onConflict: ONCONFLICT_SCHEDULES,
            count: 'exact'
          });

        if (insertError) {
          const errorMsg = `Batch ${batchNum} failed: ${insertError.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        } else {
          totalInserted += count ?? batch.length;
          console.log(`Batch ${batchNum} imported: ${count ?? batch.length} records`);
        }
      } catch (err) {
        const errorMsg = `Batch ${batchNum} exception: ${err.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Import from ${source} completed: ${totalInserted}/${validSchedules.length} inserted`);

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        inserted: totalInserted,
        total: schedules.length,
        valid: validSchedules.length,
        invalid: invalidCount,
        errors: errors,
        source: source
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errors.length === 0 ? 200 : (totalInserted > 0 ? 207 : 500)
      }
    );

  } catch (error) {
    console.error('Error in import-schedules:', error);
    
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
