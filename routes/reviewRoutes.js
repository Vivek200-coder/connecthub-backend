const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true }); // needs access to :businessId from parent router

const { upsertReview, getReviews, deleteReview, replyToReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.get('/', getReviews);

router.post(
  '/',
  protect,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().trim().isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters'),
  ],
  validate,
  upsertReview
);

router.delete('/:reviewId', protect, deleteReview);

router.post(
  '/:reviewId/reply',
  protect,
  [body('text').trim().isLength({ min: 1, max: 500 }).withMessage('Reply must be 1-500 characters')],
  validate,
  replyToReview
);

module.exports = router;
