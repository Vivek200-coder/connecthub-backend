const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: [true, 'Comment text is required'], trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

const activitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Activity title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Activity description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
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
      ],
    },
    location: {
      address: { type: String, required: [true, 'Location address is required'], trim: true },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    date: { type: Date, required: [true, 'Activity date is required'] },
    time: {
      type: String,
      required: [true, 'Activity time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM 24-hour format'],
    },
    images: [{ url: String, publicId: String }],
    maxMembers: {
      type: Number,
      min: [1, 'Maximum members must be at least 1'],
      default: 50,
    },
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [commentSchema],
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    shareCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

activitySchema.index({ title: 'text', description: 'text' });
activitySchema.index({ category: 1 });
activitySchema.index({ date: 1 });
activitySchema.index({ society: 1 });
activitySchema.index({ status: 1 });
activitySchema.index({ 'location.coordinates': '2dsphere' });

activitySchema.virtual('participantCount').get(function () {
  return this.participants.length;
});

activitySchema.virtual('isFull').get(function () {
  return this.participants.length >= this.maxMembers;
});

activitySchema.set('toJSON', { virtuals: true });
activitySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Activity', activitySchema);
