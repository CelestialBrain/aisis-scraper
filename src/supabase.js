'''import fetch from 'node-fetch'; // Falls back to native fetch in Node 18+ if not installed

export class SupabaseManager {
  constructor(syncKey) {
    this.syncKey = syncKey;
    this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-sync';
  }

  /**
   * Sync data to Supabase via github-sync Edge Function
   */
  async syncToSupabase(dataType, data, termCode = null, department = null) {
    console.log(`   ☁️ Syncing ${data.length} ${dataType} records for ${department || 'all'}...`);

    const payload = {
      type: dataType,
      data: data
    };

    // Add context fields for schedules
    if (dataType === 'schedules') {
      payload.term_code = termCode;
      payload.department = department;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.syncKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`   ✅ Successfully synced ${result.processed || 0} ${dataType}`);
        return true;
      } else {
        const text = await response.text();
        console.error(`   ❌ Error syncing ${dataType}: ${response.status} - ${text}`);
        return false;
      }
    } catch (error) {
      console.error(`   ❌ Exception syncing ${dataType}:`, error.message);
      return false;
    }
  }

  /**
   * Transform AISIS Schedule data to Lovable/Supabase format
   */
  transformScheduleData(scheduleItems) {
    return scheduleItems.map(item => ({
      subject_code: item.subjectCode,      // e.g., 'ME 11'
      section: item.section,               // e.g., 'THX1'
      course_title: item.title,
      units: parseFloat(item.units) || 0,
      time_pattern: item.time,             // e.g., 'TH 7:00-10:00'
      room: item.room,
      instructor: item.instructor,
      department: item.department,
      language: item.language,
      level: item.level,
      remarks: item.remarks,
      max_capacity: item.maxSlots,
      // Fields required by schema but not currently parsed by the scraper:
      start_time: null, 
      end_time: null,   
      days_of_week: null, 
      delivery_mode: null 
    }));
  }
}'''
