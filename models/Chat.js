const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['one_to_one', 'group'],
      required: true,
    },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],

    // Group-only fields
    groupName: { type: String, trim: true, maxlength: 100, default: '' },
    groupPhoto: { url: { type: String, default: '' }, publicId: { type: String, default: '' } },
    groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', default: null },

    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },

    // Per-user unread counters, keyed by userId string, since Mongoose Maps
    // handle this more efficiently than scanning Message collection each time.
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ type: 1, participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

// Prevent duplicate one-to-one chats between the same two users
chatSchema.statics.findOrCreateOneToOne = async function (userA, userB) {
  let chat = await this.findOne({
    type: 'one_to_one',
    participants: { $all: [userA, userB], $size: 2 },
  });

  if (!chat) {
    chat = await this.create({
      type: 'one_to_one',
      participants: [userA, userB],
    });
  }

  return chat;
};

module.exports = mongoose.model('Chat', chatSchema);
