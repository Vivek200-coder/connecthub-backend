const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [100, 'Business name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'grocery',
        'restaurant',
        'salon_spa',
        'medical_pharmacy',
        'electrician',
        'plumber',
        'carpenter',
        'tutoring',
        'fitness_trainer',
        'cleaning_services',
        'pet_care',
        'tailoring',
        'catering',
        'electronics_repair',
        'automobile',
        'real_estate',
        'other',
      ],
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', default: null },
    address: {
      street: { type: String, required: [true, 'Street address is required'], trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true },
      state: { type: String, trim: true, default: '' },
      pincode: {
        type: String,
        match: [/^\d{6}$/, 'Pincode must be 6 digits'],
        default: '',
      },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number'],
    },
    whatsapp: {
      type: String,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number'],
      default: '',
    },
    openingHours: [
      {
        day: {
          type: String,
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        },
        open: { type: String, default: '09:00' }, // HH:MM
        close: { type: String, default: '18:00' },
        isClosed: { type: Boolean, default: false },
      },
    ],
    gallery: [{ url: String, publicId: String }],
    priceRange: {
      type: String,
      enum: ['budget', 'moderate', 'premium'],
      default: 'moderate',
    },
    ratingsAverage: { type: Number, min: 0, max: 5, default: 0, set: (v) => Math.round(v * 10) / 10 },
    ratingsCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

businessSchema.index({ businessName: 'text', description: 'text' });
businessSchema.index({ category: 1 });
businessSchema.index({ 'address.city': 1 });
businessSchema.index({ ratingsAverage: -1 });
businessSchema.index({ location: '2dsphere' });
businessSchema.index({ owner: 1 });

module.exports = mongoose.model('Business', businessSchema);
