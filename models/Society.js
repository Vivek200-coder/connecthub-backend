const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Notice title is required'], trim: true, maxlength: 150 },
    content: { type: String, required: [true, 'Notice content is required'], trim: true, maxlength: 3000 },
    type: {
      type: String,
      enum: ['notice', 'announcement', 'maintenance', 'complaint_update', 'event'],
      default: 'notice',
    },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isPinned: { type: Boolean, default: false },
    attachments: [{ url: String, publicId: String, name: String }],
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const committeeMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    position: {
      type: String,
      enum: ['president', 'vice_president', 'secretary', 'treasurer', 'committee_member'],
      required: true,
    },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const societySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Society name is required'],
      trim: true,
      minlength: [3, 'Society name must be at least 3 characters'],
      maxlength: [100, 'Society name cannot exceed 100 characters'],
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    address: {
      street: { type: String, required: [true, 'Street address is required'], trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true },
      state: { type: String, required: [true, 'State is required'], trim: true },
      pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        match: [/^\d{6}$/, 'Pincode must be 6 digits'],
      },
      country: { type: String, default: 'India' },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    images: [{ url: String, publicId: String }],
    totalFlats: { type: Number, min: 0, default: 0 },
    totalBlocks: { type: Number, min: 0, default: 0 },
    amenities: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // users with full manage rights besides createdBy
    committeeMembers: [committeeMemberSchema],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    notices: [noticeSchema],
    isVerified: { type: Boolean, default: false }, // verified by ConnectHub admin
    isActive: { type: Boolean, default: true },
    joinPolicy: {
      type: String,
      enum: ['open', 'approval_required'],
      default: 'open',
    },
    pendingJoinRequests: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        flatNumber: String,
        block: String,
        requestedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

societySchema.index({ location: '2dsphere' });
societySchema.index({ name: 'text', 'address.city': 'text' });
societySchema.index({ 'address.city': 1 });
societySchema.index({ members: 1 });

// A user is "authorized to manage" a society if they created it, are in admins[],
// or hold a committee position.
societySchema.methods.isManager = function (userId) {
  const uid = userId.toString();
  if (this.createdBy.toString() === uid) return true;
  if (this.admins.some((a) => a.toString() === uid)) return true;
  if (this.committeeMembers.some((c) => c.user.toString() === uid)) return true;
  return false;
};

societySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Society', societySchema);
