const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectToDatabase = require('./db');
const Meeting = require('./models/Meeting');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. Health Check Route
app.get('/', (req, res) => {
  res.send('Calendar Manager API is running! 📅');
});

app.get('/api', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Calendar Manager API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      createMeeting: 'POST /api/meetings',
      getMeetings: 'GET /api/meetings',
      getMeetingById: 'GET /api/meetings/:id',
      updateMeeting: 'PUT /api/meetings/:id',
      deleteMeeting: 'DELETE /api/meetings/:id'
    }
  });
});

// Health Check with Database Status
app.get('/health', async (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK',
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      hasMongoURI: !!process.env.MONGO_URI
    }
  };

  try {
    await connectToDatabase();
    healthCheck.database = 'connected';
    const meetingCount = await Meeting.countDocuments();
    healthCheck.totalMeetings = meetingCount;
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.database = 'disconnected';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// Helper function to check for time conflicts
const checkTimeConflict = async (startTime, endTime, excludeMeetingId = null) => {
  const query = {
    status: 'scheduled',
    $or: [
      {
        // New meeting starts during existing meeting
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }
    ]
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  const conflictingMeetings = await Meeting.find(query);
  return conflictingMeetings;
};

// 2. Create a new meeting
app.post('/api/meetings', async (req, res) => {
  try {
    const { title, description, startTime, endTime, organizer, attendees, location } = req.body;

    // Validation
    if (!title || !startTime || !endTime || !organizer) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['title', 'startTime', 'endTime', 'organizer']
      });
    }

    // Validate environment variables
    if (!process.env.MONGO_URI) {
      console.error('Missing MONGO_URI');
      return res.status(500).json({ error: 'Server configuration error: Missing MongoDB URI' });
    }

    // Connect to DB
    await connectToDatabase();

    // Parse dates
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Validate times
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startTime or endTime' });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    // Check for conflicts
    const conflictingMeetings = await checkTimeConflict(start, end);
    
    const hasConflict = conflictingMeetings.length > 0;
    let conflictDetails = '';

    if (hasConflict) {
      conflictDetails = `This meeting conflicts with ${conflictingMeetings.length} existing meeting(s): ${
        conflictingMeetings.map(m => `"${m.title}" (${m.startTime.toLocaleString()} - ${m.endTime.toLocaleString()})`).join(', ')
      }`;
    }

    // Create the meeting regardless of conflict
    const newMeeting = await Meeting.create({
      title,
      description,
      startTime: start,
      endTime: end,
      organizer,
      attendees: attendees || [],
      location,
      hasConflict,
      conflictDetails: hasConflict ? conflictDetails : undefined
    });

    // Prepare response
    const response = {
      success: true,
      message: hasConflict 
        ? '⚠️ Meeting created successfully, but conflicts detected with existing meetings'
        : '✅ Meeting created successfully',
      data: newMeeting
    };

    if (hasConflict) {
      response.conflicts = conflictingMeetings.map(m => ({
        id: m._id,
        title: m.title,
        startTime: m.startTime,
        endTime: m.endTime,
        organizer: m.organizer
      }));
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Error creating meeting:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// 3. Get all meetings
app.get('/api/meetings', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { organizer, status, startDate, endDate, limit = 50 } = req.query;
    
    let query = {};
    
    if (organizer) {
      query.organizer = organizer;
    }
    
    if (status) {
      query.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        query.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startTime.$lte = new Date(endDate);
      }
    }

    const meetings = await Meeting.find(query)
      .sort({ startTime: 1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: meetings.length,
      data: meetings
    });
  } catch (error) {
    console.error('Error fetching meetings:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// 4. Get a single meeting by ID
app.get('/api/meetings/:id', async (req, res) => {
  try {
    await connectToDatabase();
    
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.status(200).json({
      success: true,
      data: meeting
    });
  } catch (error) {
    console.error('Error fetching meeting:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// 5. Update a meeting
app.put('/api/meetings/:id', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { title, description, startTime, endTime, organizer, attendees, location, status } = req.body;
    
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Update fields
    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (organizer) meeting.organizer = organizer;
    if (attendees) meeting.attendees = attendees;
    if (location !== undefined) meeting.location = location;
    if (status) meeting.status = status;

    // If time is being updated, check for conflicts
    if (startTime || endTime) {
      const newStart = startTime ? new Date(startTime) : meeting.startTime;
      const newEnd = endTime ? new Date(endTime) : meeting.endTime;

      if (newEnd <= newStart) {
        return res.status(400).json({ error: 'endTime must be after startTime' });
      }

      const conflictingMeetings = await checkTimeConflict(newStart, newEnd, meeting._id);
      const hasConflict = conflictingMeetings.length > 0;

      meeting.startTime = newStart;
      meeting.endTime = newEnd;
      meeting.hasConflict = hasConflict;
      
      if (hasConflict) {
        meeting.conflictDetails = `This meeting conflicts with ${conflictingMeetings.length} existing meeting(s): ${
          conflictingMeetings.map(m => `"${m.title}"`).join(', ')
        }`;
      } else {
        meeting.conflictDetails = undefined;
      }
    }

    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Meeting updated successfully',
      data: meeting
    });
  } catch (error) {
    console.error('Error updating meeting:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// 6. Delete a meeting
app.delete('/api/meetings/:id', async (req, res) => {
  try {
    await connectToDatabase();
    
    const meeting = await Meeting.findByIdAndDelete(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully',
      data: meeting
    });
  } catch (error) {
    console.error('Error deleting meeting:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Calendar Manager API running on port ${PORT}`);
});

module.exports = app;