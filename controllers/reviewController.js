const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Business = require('../models/Business');

// @desc    Create or update a review for a business (one review per user per business)
// @route   POST /api/businesses/:businessId/reviews
// @access  Private
const upsertReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const { businessId } = req.params;

  const business = await Business.findById(businessId);
  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  if (business.owner.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot review your own business.');
  }

  const review = await Review.findOneAndUpdate(
    { business: businessId, user: req.user._id },
    { rating, comment, business: businessId, user: req.user._id },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await Review.recalculateBusinessRatings(businessId);

  res.status(201).json({ success: true, review });
});

// @desc    Get all reviews for a business
// @route   GET /api/businesses/:businessId/reviews
// @access  Public
const getReviews = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [reviews, total] = await Promise.all([
    Review.find({ business: businessId })
      .populate('user', 'name profilePhoto')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments({ business: businessId }),
  ]);

  res.status(200).json({
    success: true,
    count: reviews.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    reviews,
  });
});

// @desc    Delete own review
// @route   DELETE /api/businesses/:businessId/reviews/:reviewId
// @access  Private (review author or admin)
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    res.status(404);
    throw new Error('Review not found.');
  }

  if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to delete this review.');
  }

  await Review.findOneAndDelete({ _id: review._id }); // triggers post-hook rating recalculation

  res.status(200).json({ success: true, message: 'Review deleted successfully.' });
});

// @desc    Business owner replies to a review
// @route   POST /api/businesses/:businessId/reviews/:reviewId/reply
// @access  Private (business owner only)
const replyToReview = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    res.status(404);
    throw new Error('Review not found.');
  }

  const business = await Business.findById(review.business);
  if (business.owner.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Only the business owner can reply to reviews.');
  }

  review.ownerReply = { text, repliedAt: new Date() };
  await review.save();

  res.status(200).json({ success: true, review });
});

module.exports = { upsertReview, getReviews, deleteReview, replyToReview };
