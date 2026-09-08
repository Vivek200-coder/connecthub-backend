const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Emergency type is required'],
      enum: ['sos', 'medical', 'blood_requirement', 'fire', 'security', 'accident', 'other'],
    },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', default: null },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: [true, 'Location coordinates are required'] }, // [lng, lat]
      address: { type: String, trim: true, default: '' },
    },
    // Live location sharing: additional pings after the initial report
    locationUpdates: [
      {
        coordinates: { type: [Number], required: true },
        recordedAt: { type: Date, default: Date.now },
      },
    ],
    isLiveLocationActive: { type: Boolean, default: true },

    // Blood requirement specific fields
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
      default: null,
    },
    unitsNeeded: { type: Number, min: 1, default: null },
    hospitalName: { type: String, trim: true, default: '' },

    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number'],
    },
    status: {
      type: String,
      enum: ['active', 'responding', 'resolved', 'cancelled'],
      default: 'active',
    },
    respondedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        respondedAt: { type: Date, default: Date.now },
        note: { type: String, maxlength: 300, default: '' },
      },
    ],
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

emergencySchema.index({ location: '2dsphere' });
emergencySchema.index({ society: 1, status: 1 });
emergencySchema.index({ type: 1, status: 1 });
emergencySchema.index({ raisedBy: 1 });

module.exports = mongoose.model('Emergency', emergencySchema);
