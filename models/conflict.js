const mongoose = require('mongoose');

const ConflictSchema = new mongoose.Schema({
  scenario: { type: String, required: true },
  resolution: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Conflict || mongoose.model('Conflict', ConflictSchema);