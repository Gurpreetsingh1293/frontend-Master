const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');

// @desc    Get user profile (self)
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    let profile = null;

    if (user.role === 'student') {
      profile = await StudentProfile.findOne({ userId: user._id });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        profile
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile & student details
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res, next) => {
  try {
    const { name, cohort, batchYear, onboardingCompleted, studentProfile } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name !== undefined) user.name = name;
    if (cohort !== undefined) user.cohort = cohort;
    if (batchYear !== undefined) user.batchYear = batchYear;
    if (onboardingCompleted !== undefined) user.onboardingCompleted = onboardingCompleted;

    await user.save();

    let updatedProfile = null;
    if (user.role === 'student' && studentProfile) {
      updatedProfile = await StudentProfile.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            ...(studentProfile.collegeName !== undefined && { collegeName: studentProfile.collegeName }),
            ...(studentProfile.academicField !== undefined && { academicField: studentProfile.academicField }),
            ...(studentProfile.programmeYear !== undefined && { programmeYear: studentProfile.programmeYear }),
            ...(studentProfile.bio !== undefined && { bio: studentProfile.bio }),
            ...(studentProfile.interests !== undefined && { interests: studentProfile.interests }),
            ...(studentProfile.notificationPreferences !== undefined && {
              notificationPreferences: studentProfile.notificationPreferences
            })
          }
        },
        { new: true, upsert: true }
      );
    } else if (user.role === 'student') {
      updatedProfile = await StudentProfile.findOne({ userId: user._id });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user,
        profile: updatedProfile
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = async (req, res, next) => {
  try {
    const { role, cohort, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (cohort) filter.cohort = cohort;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let profile = null;
    if (user.role === 'student') {
      profile = await StudentProfile.findOne({ userId: user._id });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        profile
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getUserById
};
