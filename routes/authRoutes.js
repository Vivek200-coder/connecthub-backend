const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const {
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
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadProfilePhoto } = require('../config/cloudinary');

// Stricter limiter for auth endpoints prone to brute force / abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordRules = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/\d/)
  .withMessage('Password must contain at least one number')
  .matches(/[A-Za-z]/)
  .withMessage('Password must contain at least one letter');

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian phone number required'),
    passwordRules,
  ],
  validate,
  register
);

router.post(
  '/login',
  authLimiter,
  [
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.post('/refresh-token', refreshToken);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);

router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('Valid email is required').normalizeEmail()],
  validate,
  forgotPassword
);

router.patch(
  '/reset-password/:token',
  authLimiter,
  [passwordRules],
  validate,
  resetPassword
);

router.get('/verify-email/:token', verifyEmail);

router.patch(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/\d/)
      .withMessage('New password must contain at least one number'),
  ],
  validate,
  changePassword
);

router.get('/me', protect, getMe);

router.patch(
  '/update-profile',
  protect,
  [
    body('name').optional().trim().isLength({ min: 2, max: 50 }),
    body('bio').optional().isLength({ max: 300 }),
  ],
  validate,
  updateProfile
);

router.patch('/update-profile-photo', protect, uploadProfilePhoto.single('photo'), updateProfilePhoto);
router.post('/fcm-token', protect, registerFcmToken);
router.delete('/deactivate', protect, deactivateAccount);

module.exports = router;
