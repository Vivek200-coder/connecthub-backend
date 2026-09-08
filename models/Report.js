const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: {
      type: String,
      required: true,
      enum: ['User', 'Business', 'Activity', 'Message', 'Society', 'Review'],
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      enum: [
        'spam',
        'harassment',
        'inappropriate_content',
        'fake_listing',
        'fraud_scam',
        'hate_speech',
        'violence_threat',
        'impersonation',
        'other',
      ],
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    evidence: [{ url: String, publicId: String }],
    status: {
      type: String,
      enum: ['pending', 'under_review', 'action_taken', 'dismissed'],
      default: 'pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index({ targetType: 1, targetId: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedBy: 1 });

module.exports = mongoose.model('Report', reportSchema);
