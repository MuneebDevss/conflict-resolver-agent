// Test Calendar Manager API
// Run with: node test-calendar-manager.js

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testCalendarManager() {
  console.log('🧪 Testing Calendar Manager API\n');
  console.log('API URL:', API_URL, '\n');

  try {
    // Test 1: Create first meeting (no conflict)
    console.log('📝 Test 1: Creating first meeting...');
    const meeting1Response = await fetch(`${API_URL}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Team Standup',
        description: 'Daily sync',
        startTime: new Date('2025-12-05T09:00:00Z'),
        endTime: new Date('2025-12-05T09:30:00Z'),
        organizer: 'john@example.com',
        attendees: ['jane@example.com', 'bob@example.com'],
        location: 'Conference Room A'
      })
    });

    const meeting1 = await meeting1Response.json();
    console.log(meeting1.message);
    console.log('Meeting ID:', meeting1.data._id);
    console.log('Has Conflict:', meeting1.data.hasConflict);
    console.log('');

    // Test 2: Create conflicting meeting
    console.log('📝 Test 2: Creating conflicting meeting...');
    const meeting2Response = await fetch(`${API_URL}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Client Call',
        description: 'Important client discussion',
        startTime: new Date('2025-12-05T09:15:00Z'),
        endTime: new Date('2025-12-05T10:00:00Z'),
        organizer: 'john@example.com',
        attendees: ['client@example.com'],
        location: 'Zoom'
      })
    });

    const meeting2 = await meeting2Response.json();
    console.log(meeting2.message);
    console.log('Meeting ID:', meeting2.data._id);
    console.log('Has Conflict:', meeting2.data.hasConflict);
    if (meeting2.conflicts) {
      console.log('Conflicting with:', meeting2.conflicts.map(c => c.title).join(', '));
    }
    console.log('');

    // Test 3: Get all meetings
    console.log('📋 Test 3: Fetching all meetings...');
    const meetingsResponse = await fetch(`${API_URL}/api/meetings`);
    const meetings = await meetingsResponse.json();
    console.log(`Found ${meetings.count} meetings:`);
    meetings.data.forEach((m, idx) => {
      console.log(`  ${idx + 1}. ${m.title} (${new Date(m.startTime).toLocaleString()}) - Conflict: ${m.hasConflict}`);
    });
    console.log('');

    // Test 4: Get specific meeting
    console.log('📄 Test 4: Getting specific meeting...');
    const meetingDetailResponse = await fetch(`${API_URL}/api/meetings/${meeting1.data._id}`);
    const meetingDetail = await meetingDetailResponse.json();
    console.log('Title:', meetingDetail.data.title);
    console.log('Organizer:', meetingDetail.data.organizer);
    console.log('Attendees:', meetingDetail.data.attendees.join(', '));
    console.log('');

    // Test 5: Update meeting
    console.log('✏️ Test 5: Updating meeting time...');
    const updateResponse = await fetch(`${API_URL}/api/meetings/${meeting1.data._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: new Date('2025-12-05T10:00:00Z'),
        endTime: new Date('2025-12-05T10:30:00Z')
      })
    });

    const updated = await updateResponse.json();
    console.log(updated.message);
    console.log('New time:', new Date(updated.data.startTime).toLocaleString());
    console.log('Has Conflict:', updated.data.hasConflict);
    console.log('');

    // Test 6: Health check
    console.log('🏥 Test 6: Health check...');
    const healthResponse = await fetch(`${API_URL}/health`);
    const health = await healthResponse.json();
    console.log('Status:', health.status);
    console.log('Database:', health.database);
    console.log('Total Meetings:', health.totalMeetings);
    console.log('');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
testCalendarManager();
