const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'activity_joined',
        'activity_comment',
        'activity_like',
        'business_review',
        'emergency_alert',
        'emergency_response',
        'society_notice',
        'society_join_request',
        'society_join_approved',
        'new_message',
        'system',
      ],
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedModel: {
      type: String,
      enum: ['Activity', 'Business', 'Emergency', 'Society', 'Chat', 'Message', null],
      default: null,
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
