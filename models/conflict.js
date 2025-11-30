const mongoose = require('mongoose');

const ConflictSchema = new mongoose.Schema({
  scenario: { type: String, required: true },
  resolution: { type: String, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.models.Conflict || mongoose.model('Conflict', ConflictSchema);