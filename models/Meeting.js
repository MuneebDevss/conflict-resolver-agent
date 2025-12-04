const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  organizer: {
    type: String,
    required: true,
    trim: true
  },
  attendees: [{
    type: String,
    trim: true
  }],
  location: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'cancelled', 'completed'],
    default: 'scheduled'
  },
  hasConflict: {
    type: Boolean,
    default: false
  },
  conflictDetails: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
MeetingSchema.index({ startTime: 1, endTime: 1 });
MeetingSchema.index({ organizer: 1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', MeetingSchema);
