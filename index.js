const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const cors = require('cors');
const connectToDatabase = require('./db');
const Meeting = require('./models/Meeting');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Store conversation histories (in production, use Redis or a database)
const conversationHistories = new Map();

// Helper function to manage conversation history
const getConversationHistory = (sessionId) => {
  if (!conversationHistories.has(sessionId)) {
    conversationHistories.set(sessionId, []);
  }
  return conversationHistories.get(sessionId);
};

const addToHistory = (sessionId, userMessage, assistantMessage, toolCall = null, toolResult = null) => {
  const history = getConversationHistory(sessionId);
  
  // Add user message
  history.push({
    role: 'user',
    content: userMessage
  });
  
  // Add assistant message with tool calls if present
  if (toolCall && assistantMessage.tool_calls) {
    history.push({
      role: 'assistant',
      content: assistantMessage.content || null,
      tool_calls: assistantMessage.tool_calls
    });
    
    // Add tool result
    if (toolResult) {
      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  } else {
    // Regular assistant message without tools
    history.push({
      role: 'assistant',
      content: assistantMessage.content
    });
  }
  
  // Keep only last 3 exchanges (limit to 9 messages to account for tool calls)
  // Each exchange can be: user message + assistant message + optional tool message
  if (history.length > 9) {
    conversationHistories.set(sessionId, history.slice(-9));
  }
};

// 1. Health Check Route
app.get('/', (req, res) => {
  res.send('Calendar Manager API is running! 📅');
});

app.get('/api', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Calendar Manager AI Agent',
    version: '2.0.0',
    description: 'Natural language calendar management with AI agent and conversation context',
    endpoints: {
      agent: 'POST /api/agent (Main AI agent - accepts natural language queries)',
      clearHistory: 'POST /api/agent/clear-history (Clear conversation history for a session)',
      health: 'GET /health',
      createMeeting: 'POST /api/meetings',
      getMeetings: 'GET /api/meetings',
      getMeetingById: 'GET /api/meetings/:id',
      updateMeeting: 'PUT /api/meetings/:id',
      deleteMeeting: 'DELETE /api/meetings/:id'
    },
    examples: [
      'POST /api/agent with body: {"query": "Schedule a team meeting tomorrow at 2pm for 1 hour", "sessionId": "user123"}',
      'POST /api/agent with body: {"query": "Show me all my meetings this week", "sessionId": "user123"}',
      'POST /api/agent with body: {"query": "Move it to 3pm", "sessionId": "user123"} // Uses context from previous queries'
    ]
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
    },
    activeConversations: conversationHistories.size
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

// Clear conversation history
app.post('/api/agent/clear-history', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  
  conversationHistories.delete(sessionId);
  
  res.status(200).json({
    success: true,
    message: 'Conversation history cleared'
  });
});

// Helper function to check for time conflicts
const checkTimeConflict = async (startTime, endTime, excludeMeetingId = null) => {
  const query = {
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

// AI Agent Endpoint - Main entry point for natural language queries
app.post('/api/agent', async (req, res) => {
  try {
    const { query, sessionId } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Use sessionId or generate one if not provided
    const session = sessionId || 'default';

    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }
    if (!process.env.MONGO_URI) {
      console.error('Missing MONGO_URI');
      return res.status(500).json({ error: 'Server configuration error: Missing MongoDB URI' });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Connect to DB
    await connectToDatabase();

    // Define available tools for the agent
    const tools = [
      {
        type: "function",
        function: {
          name: "create_meeting",
          description: "Create a new meeting in the calendar. Automatically checks for conflicts with existing meetings.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "The title/name of the meeting"
              },
              description: {
                type: "string",
                description: "Detailed description of the meeting"
              },
              startTime: {
                type: "string",
                description: "Start time in ISO 8601 format (e.g., 2025-12-05T10:00:00Z)"
              },
              endTime: {
                type: "string",
                description: "End time in ISO 8601 format (e.g., 2025-12-05T11:00:00Z)"
              },
              forceCreate: {
                type: "boolean",
                description: "Set to true to create meeting even if there's a conflict (only after user confirms)"
              }
            },
            required: ["title", "startTime", "endTime"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_meetings",
          description: "Retrieve meetings from the calendar. Can filter by date range.",
          parameters: {
            type: "object",
            properties: {
              startDate: {
                type: "string",
                description: "Filter meetings starting from this date (ISO 8601)"
              },
              endDate: {
                type: "string",
                description: "Filter meetings up to this date (ISO 8601)"
              },
              limit: {
                type: "number",
                description: "Maximum number of meetings to return (default 50)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_meeting",
          description: "Update an existing meeting. Can modify title, times, attendees, location, or status.",
          parameters: {
            type: "object",
            properties: {
              meetingId: {
                type: "string",
                description: "The ID of the meeting to update"
              },
              title: {
                type: "string",
                description: "New title for the meeting"
              },
              description: {
                type: "string",
                description: "New description"
              },
              startTime: {
                type: "string",
                description: "New start time in ISO 8601 format"
              },
              endTime: {
                type: "string",
                description: "New end time in ISO 8601 format"
              }
            },
            required: ["meetingId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_meeting",
          description: "Delete a meeting from the calendar.",
          parameters: {
            type: "object",
            properties: {
              meetingId: {
                type: "string",
                description: "The ID of the meeting to delete"
              }
            },
            required: ["meetingId"]
          }
        }
      }
    ];

    // Get conversation history for this session
    const history = getConversationHistory(session);

    // Build messages array with system prompt, history, and current query
    const messages = [
      {
        role: "system",
        content: `You are a helpful calendar management AI agent. You can help users create, view, update, and delete meetings.

When users ask about their calendar:
- Parse dates and times from natural language (convert to ISO 8601 format)
- Understand relative times (e.g., "tomorrow at 2pm", "next Monday")
- Extract meeting details from conversational requests
- Use the provided functions to interact with the calendar system
- Always confirm the action taken and provide relevant details
- Use context from previous messages to understand references like "it", "that meeting", "the same time", etc.

IMPORTANT - Conflict Handling:
- When creating a meeting, if there's a time conflict, DO NOT create the meeting automatically
- Instead, inform the user about the conflict and the conflicting meeting(s)
- Ask the user to either:
  1. Choose a different time
  2. Confirm they want to proceed anyway (use forceCreate: true parameter)
- Only create a conflicting meeting if the user explicitly confirms they want to proceed despite the conflict

Current date/time context: ${new Date().toISOString()}`
      },
      ...history,
      {
        role: "user",
        content: query
      }
    ];

    // Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      tools: tools,
      tool_choice: "auto"
    });

    const assistantMessage = response.choices[0].message;

    // Check if the model wants to call a function
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      let functionResult;

      // Execute the appropriate function
      switch (functionName) {
        case 'create_meeting':
          const start = new Date(functionArgs.startTime);
          const end = new Date(functionArgs.endTime);

          if (end <= start) {
            functionResult = { error: 'endTime must be after startTime' };
            break;
          }

          const conflicts = await checkTimeConflict(start, end);
          const hasConflict = conflicts.length > 0;

          // If there's a conflict and user hasn't confirmed, don't create the meeting
          if (hasConflict && !functionArgs.forceCreate) {
            functionResult = {
              success: false,
              hasConflict: true,
              requiresConfirmation: true,
              message: 'Time conflict detected. Please choose a different time or confirm to create anyway.',
              conflicts: conflicts.map(m => ({
                id: m._id,
                title: m.title,
                startTime: m.startTime,
                endTime: m.endTime
              })),
              proposedMeeting: {
                title: functionArgs.title,
                description: functionArgs.description,
                startTime: start,
                endTime: end
              }
            };
            break;
          }

          // Create meeting if no conflict or user has confirmed
          const newMeeting = await Meeting.create({
            title: functionArgs.title,
            description: functionArgs.description,
            startTime: start,
            endTime: end,
            hasConflict
          });

          functionResult = {
            success: true,
            meeting: newMeeting,
            hasConflict,
            conflicts: hasConflict ? conflicts.map(m => ({
              id: m._id,
              title: m.title,
              startTime: m.startTime,
              endTime: m.endTime
            })) : []
          };
          break;

        case 'get_meetings':
          let query = {};
          if (functionArgs.startDate || functionArgs.endDate) {
            query.startTime = {};
            if (functionArgs.startDate) query.startTime.$gte = new Date(functionArgs.startDate);
            if (functionArgs.endDate) query.startTime.$lte = new Date(functionArgs.endDate);
          }

          const meetings = await Meeting.find(query)
            .sort({ startTime: 1 })
            .limit(functionArgs.limit || 50);

          functionResult = {
            success: true,
            count: meetings.length,
            meetings: meetings
          };
          break;

        case 'update_meeting':
          const meeting = await Meeting.findById(functionArgs.meetingId);
          
          if (!meeting) {
            functionResult = { success: false, error: 'Meeting not found' };
            break;
          }

          if (functionArgs.title) meeting.title = functionArgs.title;
          if (functionArgs.description !== undefined) meeting.description = functionArgs.description;

          if (functionArgs.startTime || functionArgs.endTime) {
            const newStart = functionArgs.startTime ? new Date(functionArgs.startTime) : meeting.startTime;
            const newEnd = functionArgs.endTime ? new Date(functionArgs.endTime) : meeting.endTime;

            if (newEnd <= newStart) {
              functionResult = { success: false, error: 'endTime must be after startTime' };
              break;
            }

            const updateConflicts = await checkTimeConflict(newStart, newEnd, meeting._id);
            meeting.startTime = newStart;
            meeting.endTime = newEnd;
            meeting.hasConflict = updateConflicts.length > 0;
          }

          await meeting.save();
          functionResult = { success: true, meeting };
          break;

        case 'delete_meeting':
          const deletedMeeting = await Meeting.findByIdAndDelete(functionArgs.meetingId);
          
          if (!deletedMeeting) {
            functionResult = { success: false, error: 'Meeting not found' };
          } else {
            functionResult = { success: true, deletedMeeting };
          }
          break;

        default:
          functionResult = { error: 'Unknown function' };
      }

      // Send the function result back to OpenAI for a natural language response
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          ...messages,
          assistantMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          }
        ]
      });

      const finalResponse = secondResponse.choices[0].message.content;

      // Add to conversation history (including tool call and result)
      addToHistory(session, query, assistantMessage, toolCall, functionResult);

      return res.status(200).json({
        success: true,
        response: finalResponse,
        action: functionName,
        result: functionResult,
        sessionId: session
      });

    } else {
      // No function call - just return the assistant's message
      addToHistory(session, query, assistantMessage);

      return res.status(200).json({
        success: true,
        response: assistantMessage.content,
        action: 'none',
        sessionId: session
      });
    }

  } catch (error) {
    console.error('Error in agent:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// 2. Create a new meeting
app.post('/api/meetings', async (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body;

    // Validation
    if (!title || !startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['title', 'startTime', 'endTime']
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

    // Create the meeting regardless of conflict
    const newMeeting = await Meeting.create({
      title,
      description,
      startTime: start,
      endTime: end,
      hasConflict
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
        endTime: m.endTime
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
    
    const { startDate, endDate, limit = 50 } = req.query;
    
    let query = {};

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
    
    const { title, description, startTime, endTime } = req.body;
    
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Update fields
    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;

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