const mongoose = require('mongoose');
const Business = require('./Business');

const reviewSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    images: [{ url: String, publicId: String }],
    ownerReply: {
      text: { type: String, maxlength: 500, default: '' },
      repliedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One review per user per business - re-reviewing updates the existing review
reviewSchema.index({ business: 1, user: 1 }, { unique: true });
reviewSchema.index({ business: 1, createdAt: -1 });

// Recalculate the parent business's ratingsAverage/ratingsCount from all reviews
reviewSchema.statics.recalculateBusinessRatings = async function (businessId) {
  const stats = await this.aggregate([
    { $match: { business: businessId } },
    {
      $group: {
        _id: '$business',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Business.findByIdAndUpdate(businessId, {
      ratingsAverage: stats[0].avgRating,
      ratingsCount: stats[0].count,
    });
  } else {
    await Business.findByIdAndUpdate(businessId, { ratingsAverage: 0, ratingsCount: 0 });
  }
};

// Keep Business ratings in sync whenever a review is saved or removed
reviewSchema.post('save', function () {
  this.constructor.recalculateBusinessRatings(this.business);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) doc.constructor.recalculateBusinessRatings(doc.business);
});

module.exports = mongoose.model('Review', reviewSchema);
