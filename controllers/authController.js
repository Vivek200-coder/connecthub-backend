const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { sendPasswordResetEmail, sendEmailVerification } = require('../utils/sendEmail');
const { deleteFromCloudinary, extractPublicId } = require('../config/cloudinary');

const REFRESH_COOKIE_NAME = 'connecthub_refresh_token';

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/api/auth',
});

const buildAuthResponse = async (res, user, statusCode) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Keep at most 5 refresh tokens per user (5 devices), prune oldest
  user.refreshTokens = [...(user.refreshTokens || []), refreshToken].slice(-5);
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user,
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, society, flatNumber, block } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    res.status(409);
    throw new Error(
      existingUser.email === email
        ? 'An account with this email already exists.'
        : 'An account with this phone number already exists.'
    );
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
    society: society || null,
    flatNumber: flatNumber || '',
    block: block || '',
  });

  // Fire-and-forget email verification; do not block registration on email delivery
  try {
    const verifyToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${verifyToken}`;
    await sendEmailVerification(user, verifyUrl);
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
  }

  await buildAuthResponse(res, user, 201);
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;

  if (!emailOrPhone || !password) {
    res.status(400);
    throw new Error('Please provide email/phone and password.');
  }

  const isEmail = emailOrPhone.includes('@');
  const query = isEmail ? { email: emailOrPhone.toLowerCase() } : { phone: emailOrPhone };

  const user = await User.findOne(query).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error('Invalid credentials.');
  }

  if (!user.isActive || user.isBanned) {
    res.status(403);
    throw new Error('This account has been deactivated or banned.');
  }

  await buildAuthResponse(res, user, 200);
});

// @desc    Refresh access token using refresh token
// @route   POST /api/auth/refresh-token
// @access  Public (requires valid refresh token)
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME];

  if (!token) {
    res.status(401);
    throw new Error('Refresh token missing.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error('Invalid or expired refresh token. Please log in again.');
  }

  const user = await User.findById(decoded.id);

  if (!user || !user.refreshTokens.includes(token)) {
    res.status(401);
    throw new Error('Refresh token not recognized. Please log in again.');
  }

  // Rotate: remove used token, issue a new pair
  user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
  const newAccessToken = user.generateAccessToken();
  const newRefreshToken = user.generateRefreshToken();
  user.refreshTokens.push(newRefreshToken);
  await user.save({ validateBeforeSave: false });

  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());

  res.status(200).json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

// @desc    Logout - invalidate refresh token
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME];

  if (token) {
    req.user.refreshTokens = req.user.refreshTokens.filter((t) => t !== token);
    await req.user.save({ validateBeforeSave: false });
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// @desc    Logout from all devices
// @route   POST /api/auth/logout-all
// @access  Private
const logoutAll = asyncHandler(async (req, res) => {
  req.user.refreshTokens = [];
  await req.user.save({ validateBeforeSave: false });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.status(200).json({ success: true, message: 'Logged out from all devices.' });
});

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });

  // Always respond with success to avoid leaking which emails are registered
  const genericResponse = {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await sendPasswordResetEmail(user, resetUrl);
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    console.error('Failed to send password reset email:', err.message);
    res.status(500);
    throw new Error('Failed to send reset email. Please try again later.');
  }

  res.status(200).json(genericResponse);
});

// @desc    Reset password using token from email
// @route   PATCH /api/auth/reset-password/:token
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+password +passwordResetToken +passwordResetExpires');

  if (!user) {
    res.status(400);
    throw new Error('Password reset token is invalid or has expired.');
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // invalidate all existing sessions
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.',
  });
});

// @desc    Verify email using token
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    res.status(400);
    throw new Error('Email verification token is invalid or has expired.');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, message: 'Email verified successfully.' });
});

// @desc    Change password (while logged in)
// @route   PATCH /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    res.status(401);
    throw new Error('Current password is incorrect.');
  }

  user.password = newPassword;
  user.refreshTokens = []; // force re-login on all devices
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully. Please log in again.',
  });
});

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('society', 'name address city');
  res.status(200).json({ success: true, user });
});

// @desc    Update profile details
// @route   PATCH /api/auth/update-profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'bio', 'flatNumber', 'block', 'emergencyContacts', 'society'];
  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, user });
});

// @desc    Upload / replace profile photo
// @route   PATCH /api/auth/update-profile-photo
// @access  Private
const updateProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file.');
  }

  const user = await User.findById(req.user._id);

  // Delete old photo from Cloudinary if it exists
  if (user.profilePhoto?.publicId) {
    await deleteFromCloudinary(user.profilePhoto.publicId);
  }

  user.profilePhoto = {
    url: req.file.path,
    publicId: req.file.filename || extractPublicId(req.file.path),
  };

  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, user });
});

// @desc    Register / update FCM token for push notifications
// @route   POST /api/auth/fcm-token
// @access  Private
const registerFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    res.status(400);
    throw new Error('fcmToken is required.');
  }

  await User.findByIdAndUpdate(req.user._id, { $addToSet: { fcmTokens: fcmToken } });

  res.status(200).json({ success: true, message: 'FCM token registered.' });
});

// @desc    Deactivate own account
// @route   DELETE /api/auth/deactivate
// @access  Private
const deactivateAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { isActive: false, refreshTokens: [] });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.status(200).json({ success: true, message: 'Account deactivated.' });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  changePassword,
  getMe,
  updateProfile,
  updateProfilePhoto,
  registerFcmToken,
  deactivateAccount,
};
