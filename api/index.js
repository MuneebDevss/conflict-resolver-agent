const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const cors = require('cors');
const connectToDatabase = require('./db');
const Conflict = require('../models/Conflict');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. Health Check Route
app.get('/', (req, res) => {
  res.send('Conflict Resolver API is running!');
});

app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Conflict Resolver API' });
});

// 2. The Resolution Route
app.post('/api/resolve', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }
    if (!process.env.MONGO_URI) {
      console.error('Missing MONGO_URI');
      return res.status(500).json({ error: 'Server configuration error: Missing MongoDB URI' });
    }

    // Initialize OpenAI client per request (safer for serverless)
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Connect to DB
    await connectToDatabase();

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are an empathetic, expert conflict mediator. Read the user's conflict scenario. Provide a calm, objective analysis and 3 actionable steps to resolve the conflict using 'Non-Violent Communication' techniques." 
        },
        { role: "user", content: message },
      ],
    });

    const aiResponse = completion.choices[0].message.content;

    // Save to MongoDB
    const newRecord = await Conflict.create({
      scenario: message,
      resolution: aiResponse
    });

    // Return response
    res.status(200).json({
      success: true,
      data: newRecord
    });

  } catch (error) {
    console.error('Error in /api/resolve:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// For local development only
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

// Export the Express app directly for Vercel
module.exports = app;