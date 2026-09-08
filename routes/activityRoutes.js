const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  createActivity,
  getActivities,
  getActivity,
  updateActivity,
  deleteActivity,
  joinActivity,
  leaveActivity,
  toggleLike,
  addComment,
  deleteComment,
  shareActivity,
} = require('../controllers/activityController');

const { protect, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadActivityImages } = require('../config/cloudinary');

const CATEGORIES = [
  'sports',
  'fitness',
  'cultural',
  'festival',
  'workshop',
  'kids',
  'social',
  'volunteering',
  'music',
  'games',
  'other',
];

const activityValidation = [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').trim().isLength({ min: 3, max: 2000 }).withMessage('Description must be 3-2000 characters'),
  body('category').isIn(CATEGORIES).withMessage('Invalid category'),
  body('location.address').trim().notEmpty().withMessage('Location address is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('time')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Time must be in HH:MM 24-hour format'),
  body('maxMembers').optional().isInt({ min: 1 }).withMessage('Max members must be a positive integer'),
];

router.get('/', optionalAuth, getActivities);
router.post('/', protect, uploadActivityImages.array('images', 6), activityValidation, validate, createActivity);

router.get('/:id', optionalAuth, getActivity);
router.patch('/:id', protect, uploadActivityImages.array('images', 6), updateActivity);
router.delete('/:id', protect, deleteActivity);

router.post('/:id/join', protect, joinActivity);
router.post('/:id/leave', protect, leaveActivity);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/share', protect, shareActivity);

router.post(
  '/:id/comments',
  protect,
  [body('text').trim().isLength({ min: 1, max: 500 }).withMessage('Comment must be 1-500 characters')],
  validate,
  addComment
);
router.delete('/:id/comments/:commentId', protect, deleteComment);

module.exports = router;
