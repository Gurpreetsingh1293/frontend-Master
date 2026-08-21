const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    mentorName: {
      type: String,
      required: [true, 'Mentor name is required'],
      trim: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled date and time is required']
    },
    durationMinutes: {
      type: Number,
      default: 30
    },
    meetingLink: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;
