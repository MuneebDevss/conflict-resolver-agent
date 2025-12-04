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
  hasConflict: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster queries
MeetingSchema.index({ startTime: 1, endTime: 1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', MeetingSchema);
