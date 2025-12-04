# Calendar Manager API - Quick Start Guide

## What Changed?

Your project has been transformed from a conflict resolver to a **Calendar Manager** that:

✅ Creates meetings with automatic conflict detection
✅ Retrieves all meetings with filtering options
✅ Updates existing meetings
✅ Deletes meetings
✅ Notifies when meetings overlap (but still creates them)

## Key Features

### 1. Create Meeting with Conflict Detection
When you create a meeting, the system checks for overlaps and notifies you:

```bash
POST /api/meetings
{
  "title": "Team Meeting",
  "startTime": "2025-12-05T09:00:00Z",
  "endTime": "2025-12-05T10:00:00Z",
  "organizer": "john@example.com"
}

# Response includes conflicts if any exist
{
  "success": true,
  "message": "⚠️ Meeting created successfully, but conflicts detected",
  "conflicts": [...]
}
```

### 2. Get All Meetings
Retrieve meetings with optional filters:

```bash
GET /api/meetings?organizer=john@example.com&status=scheduled
```

### 3. Update & Delete
```bash
PUT /api/meetings/:id
DELETE /api/meetings/:id
```

## Database Schema

**Meeting Model:**
- title (required)
- description
- startTime (required)
- endTime (required)
- organizer (required)
- attendees (array)
- location
- status (scheduled/cancelled/completed)
- hasConflict (boolean)
- conflictDetails (string)

## Testing

Run the included test:
```bash
node test-calendar-manager.js
```

## Environment Variables

Only need:
```env
MONGO_URI=your_mongodb_uri
PORT=3000
```

**Note:** OpenAI API key is no longer required!

## Deploy on Render

1. Push to GitHub ✅ (Done)
2. In Render dashboard:
   - Build: `npm install`
   - Start: `npm start`
   - Add env var: `MONGO_URI`
3. Deploy!

Your API will be live and ready to manage meetings with automatic conflict detection.
