import fetch from 'node-fetch'; 

export class SupabaseManager {
  constructor(ingestToken) {
    this.ingestToken = ingestToken;
    this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-data-ingest';
  }

  async syncToSupabase(dataType, data, termCode = null, department = null) {
    console.log(`   ☁️ Syncing ${data.length} ${dataType} records for ${department || 'all'}...`);

    const payload = {
      data_type: dataType,
      records: data,
      metadata: {}
    };

    if (dataType === 'schedules') {
      payload.metadata.term_code = termCode;
      payload.metadata.department = department;
    }

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
        console.log(`   ✅ Successfully synced ${dataType}`);
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

  // ✅ FIX: Correct mapping for Curriculum
  transformCurriculumData(curriculumItems) {
    return curriculumItems.map(item => {
      return {
        degree_code: item.degree,
        year_level: item.yearLevel,
        semester: item.semester,
        course_code: item.courseCode,
        course_title: item.description, // <--- Correctly mapped for Lovable DB
        units: parseFloat(item.units) || 0,
        category: item.category || null
      };
    });
  }

  // ✅ FIX: Correct mapping for Schedules
  transformScheduleData(scheduleItems) {
    return scheduleItems.map(item => {
      const parsedTime = this.parseTimePattern(item.time);
      
      return {
        subject_code: item.subjectCode, // Maps from scraper
        section: item.section,
        course_title: item.title, // Maps from scraper
        units: parseFloat(item.units) || 0,
        time_pattern: item.time,
        room: item.room,
        instructor: item.instructor,
        department: item.department,
        language: item.language,
        level: item.level,
        remarks: item.remarks,
        max_capacity: item.maxSlots, // Maps from scraper
        
        start_time: parsedTime.start || '00:00:00', 
        end_time: parsedTime.end || '23:59:59',     
        days_of_week: parsedTime.days,
        delivery_mode: null
      };
    });
  }
}
