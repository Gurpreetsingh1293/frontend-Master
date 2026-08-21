const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    collegeName: {
      type: String,
      default: null,
      trim: true
    },
    academicField: {
      type: String,
      default: null,
      trim: true
    },
    programmeYear: {
      type: Number,
      min: 1,
      max: 4,
      default: null
    },
    bio: {
      type: String,
      default: null,
      maxlength: 1000
    },
    interests: [
      {
        interestKey: { type: String, required: true },
        priority: { type: Number, default: 1 },
        selectedAt: { type: Date, default: Date.now }
      }
    ],
    notificationPreferences: {
      emailNotificationsEnabled: { type: Boolean, default: true },
      courseRecommendationEmails: { type: Boolean, default: true },
      meetingUpdateEmails: { type: Boolean, default: true }
    }
  },
  {
    timestamps: true
  }
);

const StudentProfile = mongoose.model('StudentProfile', studentProfileSchema);

module.exports = StudentProfile;
