const mongoose = require('mongoose');

const ConflictSchema = new mongoose.Schema({
  scenario: { 
    type: String, 
    required: true,
    trim: true
  },
  resolution: { 
    type: String, 
    required: true 
  },
  intent: {
    type: String,
    enum: [
      'SCHEDULE_CONFLICT',
      'FIND_TIME',
      'PRIORITIZE_EVENTS',
      'RESCHEDULE_REQUEST',
      'GENERAL_CONFLICT',
      'QUERY_HISTORY',
      'OTHER'
    ],
    default: 'OTHER'
  },
  conflictType: {
    type: String,
    enum: [
      'calendar_conflict',
      'find_availability',
      'event_prioritization',
      'reschedule_assistance',
      'interpersonal_conflict',
      'history_query',
      'general_inquiry',
      'general'
    ],
    default: 'general'
  },
  metadata: {
    responseTime: Number,
    model: {
      type: String,
      default: 'gpt-4o-mini'
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ConflictSchema.index({ conflictType: 1, createdAt: -1 });
ConflictSchema.index({ intent: 1 });
ConflictSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Conflict || mongoose.model('Conflict', ConflictSchema);