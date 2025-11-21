import { google } from 'googleapis';

/**
 * Google Sheets Manager
 * Handles authentication and data updates to Google Sheets
 */
export class SheetsManager {
  constructor(spreadsheetId, credentials) {
    this.spreadsheetId = spreadsheetId;
    this.credentials = credentials;
    this.sheets = null;
  }

  /**
   * Authenticate with Google Sheets API
   */
  async authenticate() {
    console.log('🔐 Authenticating with Google Sheets...');
    
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: this.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      const authClient = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
      
      console.log('✅ Google Sheets authentication successful');
      return true;
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  }

  /**
   * Clear a sheet range
   */
  async clearSheet(sheetName) {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });
      console.log(`   Cleared sheet: ${sheetName}`);
    } catch (error) {
      console.error(`   ⚠️ Error clearing ${sheetName}:`, error.message);
    }
  }

  /**
   * Update a sheet with data
   */
  async updateSheet(sheetName, headers, rows) {
    try {
      if (!rows || rows.length === 0) {
        console.log(`   ⚠️ No data to update for ${sheetName}`);
        return;
      }

      // Clear existing data
      await this.clearSheet(sheetName);

      // Prepare data with headers
      const values = [headers, ...rows];

      // Update sheet
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values }
      });

      console.log(`   ✅ Updated ${sheetName}: ${rows.length} rows`);
    } catch (error) {
      console.error(`   ❌ Error updating ${sheetName}:`, error.message);
    }
  }

  /**
   * Create or ensure sheet exists
   */
  async ensureSheetExists(sheetName) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const sheetExists = response.data.sheets.some(
        sheet => sheet.properties.title === sheetName
      );

      if (!sheetExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: sheetName }
              }
            }]
          }
        });
        console.log(`   Created new sheet: ${sheetName}`);
      }
    } catch (error) {
      console.error(`   ⚠️ Error ensuring sheet ${sheetName}:`, error.message);
    }
  }

  /**
   * Update all scraped data to Google Sheets
   */
  async updateAllData(scrapedData) {
    console.log('\n📊 Updating Google Sheets with scraped data...\n');

    try {
      // 1. Schedule of Classes
      if (scrapedData.scheduleOfClasses && scrapedData.scheduleOfClasses.length > 0) {
        await this.ensureSheetExists('Schedule of Classes');
        const headers = ['Department', 'Subject Code', 'Section', 'Title', 'Units', 'Time', 'Room', 'Instructor', 'Max Slots', 'Language', 'Level', 'Free Slots', 'Remarks'];
        const rows = scrapedData.scheduleOfClasses.map(item => [
          item.department, item.subjectCode, item.section, item.title, item.units,
          item.time, item.room, item.instructor, item.maxSlots, item.language,
          item.level, item.freeSlots, item.remarks
        ]);
        await this.updateSheet('Schedule of Classes', headers, rows);
      }

      // 2. Official Curriculum
      if (scrapedData.officialCurriculum && scrapedData.officialCurriculum.length > 0) {
        await this.ensureSheetExists('Official Curriculum');
        const headers = ['Degree', 'Year Level', 'Semester', 'Course Code', 'Description', 'Units', 'Category'];
        const rows = scrapedData.officialCurriculum.map(item => [
          item.degree, item.yearLevel, item.semester, item.courseCode,
          item.description, item.units, item.category
        ]);
        await this.updateSheet('Official Curriculum', headers, rows);
      }

      // 3. View Grades
      if (scrapedData.viewGrades && scrapedData.viewGrades.length > 0) {
        await this.ensureSheetExists('View Grades');
        const headers = ['School Year', 'Semester', 'Course Code', 'Description', 'Units', 'Grade', 'QPI'];
        const rows = scrapedData.viewGrades.map(item => [
          item.schoolYear, item.semester, item.courseCode, item.description,
          item.units, item.grade, item.qpi
        ]);
        await this.updateSheet('View Grades', headers, rows);
      }

      // 4. Advisory Grades
      if (scrapedData.advisoryGrades && scrapedData.advisoryGrades.length > 0) {
        await this.ensureSheetExists('Advisory Grades');
        const headers = ['Course Code', 'Description', 'Units', 'Grade', 'Remarks'];
        const rows = scrapedData.advisoryGrades.map(item => [
          item.courseCode, item.description, item.units, item.grade, item.remarks
        ]);
        await this.updateSheet('Advisory Grades', headers, rows);
      }

      // 5. Currently Enrolled Classes
      if (scrapedData.enrolledClasses && scrapedData.enrolledClasses.length > 0) {
        await this.ensureSheetExists('Currently Enrolled');
        const headers = ['Subject Code', 'Section', 'Title', 'Units', 'Time', 'Room', 'Instructor'];
        const rows = scrapedData.enrolledClasses.map(item => [
          item.subjectCode, item.section, item.title, item.units,
          item.time, item.room, item.instructor
        ]);
        await this.updateSheet('Currently Enrolled', headers, rows);
      }

      // 6. My Class Schedule
      if (scrapedData.classSchedule && scrapedData.classSchedule.length > 0) {
        await this.ensureSheetExists('My Class Schedule');
        const headers = ['Course Code', 'Section', 'Time', 'Room', 'Instructor'];
        const rows = scrapedData.classSchedule.map(item => [
          item.courseCode, item.section, item.time, item.room, item.instructor
        ]);
        await this.updateSheet('My Class Schedule', headers, rows);
      }

      // 7. Tuition Receipt
      if (scrapedData.tuitionReceipt && scrapedData.tuitionReceipt.length > 0) {
        await this.ensureSheetExists('Tuition Receipt');
        const headers = ['OR Number', 'Date', 'Amount', 'Remarks'];
        const rows = scrapedData.tuitionReceipt.map(item => [
          item.orNumber, item.date, item.amount, item.remarks
        ]);
        await this.updateSheet('Tuition Receipt', headers, rows);
      }

      // 8. Student Information
      if (scrapedData.studentInfo && scrapedData.studentInfo.length > 0) {
        await this.ensureSheetExists('Student Information');
        const info = scrapedData.studentInfo[0];
        const headers = ['Field', 'Value'];
        const rows = Object.entries(info).map(([key, value]) => [key, value]);
        await this.updateSheet('Student Information', headers, rows);
      }

      // 9. Program of Study
      if (scrapedData.programOfStudy && scrapedData.programOfStudy.length > 0) {
        await this.ensureSheetExists('Program of Study');
        const headers = ['Course Code', 'Description', 'Units', 'Grade', 'Status'];
        const rows = scrapedData.programOfStudy.map(item => [
          item.courseCode, item.description, item.units, item.grade, item.status
        ]);
        await this.updateSheet('Program of Study', headers, rows);
      }

      // 10. Hold Orders
      if (scrapedData.holdOrders && scrapedData.holdOrders.length > 0) {
        await this.ensureSheetExists('Hold Orders');
        const headers = ['Department', 'Hold Type', 'Reason', 'Date Added'];
        const rows = scrapedData.holdOrders.map(item => [
          item.department, item.holdType, item.reason, item.dateAdded
        ]);
        await this.updateSheet('Hold Orders', headers, rows);
      }

      // 11. Faculty Attendance
      if (scrapedData.facultyAttendance && scrapedData.facultyAttendance.length > 0) {
        await this.ensureSheetExists('Faculty Attendance');
        const headers = ['Course Code', 'Section', 'Present', 'Absent', 'Late', 'Excused'];
        const rows = scrapedData.facultyAttendance.map(item => [
          item.courseCode, item.section, item.present, item.absent, item.late, item.excused
        ]);
        await this.updateSheet('Faculty Attendance', headers, rows);
      }

      // Update metadata sheet
      await this.ensureSheetExists('Metadata');
      const metaHeaders = ['Field', 'Value'];
      const metaRows = [
        ['Last Updated', scrapedData.timestamp],
        ['Total Categories', '11'],
        ['Schedule of Classes Count', scrapedData.scheduleOfClasses?.length || 0],
        ['Official Curriculum Count', scrapedData.officialCurriculum?.length || 0],
        ['View Grades Count', scrapedData.viewGrades?.length || 0],
        ['Advisory Grades Count', scrapedData.advisoryGrades?.length || 0],
        ['Currently Enrolled Count', scrapedData.enrolledClasses?.length || 0],
        ['My Class Schedule Count', scrapedData.classSchedule?.length || 0],
        ['Tuition Receipt Count', scrapedData.tuitionReceipt?.length || 0],
        ['Program of Study Count', scrapedData.programOfStudy?.length || 0],
        ['Hold Orders Count', scrapedData.holdOrders?.length || 0],
        ['Faculty Attendance Count', scrapedData.facultyAttendance?.length || 0]
      ];
      await this.updateSheet('Metadata', metaHeaders, metaRows);

      console.log('\n✅ All data successfully updated to Google Sheets!');

    } catch (error) {
      console.error('\n❌ Error updating Google Sheets:', error.message);
      throw error;
    }
  }
}
