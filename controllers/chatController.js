const asyncHandler = require('express-async-handler');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { deleteFromCloudinary, extractPublicId } = require('../config/cloudinary');

// @desc    Start (or fetch existing) one-to-one chat with another user
// @route   POST /api/chats/one-to-one
// @access  Private
const startOneToOneChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (userId === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot start a chat with yourself.');
  }

  const otherUser = await User.findById(userId);
  if (!otherUser) {
    res.status(404);
    throw new Error('User not found.');
  }

  const chat = await Chat.findOrCreateOneToOne(req.user._id, userId);
  await chat.populate('participants', 'name profilePhoto');
  await chat.populate('lastMessage');

  res.status(200).json({ success: true, chat });
});

// @desc    Create a group chat
// @route   POST /api/chats/group
// @access  Private
const createGroupChat = asyncHandler(async (req, res) => {
  const { groupName, participantIds, society } = req.body;

  const uniqueParticipants = [...new Set([...(participantIds || []), req.user._id.toString()])];

  if (uniqueParticipants.length < 3) {
    res.status(400);
    throw new Error('A group chat needs at least 3 participants (including you).');
  }

  const chat = await Chat.create({
    type: 'group',
    groupName,
    participants: uniqueParticipants,
    groupAdmins: [req.user._id],
    createdBy: req.user._id,
    society: society || req.user.society || null,
  });

  await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type: 'system',
    text: `${req.user.name} created the group "${groupName}"`,
  });

  await chat.populate('participants', 'name profilePhoto');

  res.status(201).json({ success: true, chat });
});

// @desc    Get all chats for current user (with last message preview)
// @route   GET /api/chats
// @access  Private
const getMyChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({ participants: req.user._id, isActive: true })
    .populate('participants', 'name profilePhoto')
    .populate({ path: 'lastMessage', select: 'text type sender createdAt' })
    .sort('-lastMessageAt');

  const chatsWithUnread = chats.map((chat) => {
    const obj = chat.toObject();
    obj.unreadCount = chat.unreadCounts.get(req.user._id.toString()) || 0;
    delete obj.unreadCounts;
    return obj;
  });

  res.status(200).json({ success: true, count: chatsWithUnread.length, chats: chatsWithUnread });
});

// @desc    Get single chat details
// @route   GET /api/chats/:id
// @access  Private (participant only)
const getChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('participants', 'name profilePhoto')
    .populate('groupAdmins', 'name');

  if (!chat) {
    res.status(404);
    throw new Error('Chat not found.');
  }

  if (!chat.participants.some((p) => p._id.toString() === req.user._id.toString())) {
    res.status(403);
    throw new Error('You are not a participant of this chat.');
  }

  res.status(200).json({ success: true, chat });
});

// @desc    Add participants to a group chat
// @route   POST /api/chats/:id/participants
// @access  Private (group admin only)
const addParticipants = asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  const chat = await Chat.findById(req.params.id);

  if (!chat || chat.type !== 'group') {
    res.status(404);
    throw new Error('Group chat not found.');
  }

  if (!chat.groupAdmins.some((a) => a.toString() === req.user._id.toString())) {
    res.status(403);
    throw new Error('Only group admins can add participants.');
  }

  const newIds = userIds.filter((id) => !chat.participants.some((p) => p.toString() === id));
  chat.participants.push(...newIds);
  await chat.save();
  await chat.populate('participants', 'name profilePhoto');

  res.status(200).json({ success: true, chat });
});

// @desc    Leave / remove self from a group chat
// @route   POST /api/chats/:id/leave
// @access  Private (participant only)
const leaveGroupChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);

  if (!chat || chat.type !== 'group') {
    res.status(404);
    throw new Error('Group chat not found.');
  }

  chat.participants = chat.participants.filter((p) => p.toString() !== req.user._id.toString());
  chat.groupAdmins = chat.groupAdmins.filter((a) => a.toString() !== req.user._id.toString());
  await chat.save();

  await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type: 'system',
    text: `${req.user.name} left the group`,
  });

  res.status(200).json({ success: true, message: 'Left the group chat.' });
});

// @desc    Update group photo
// @route   PATCH /api/chats/:id/photo
// @access  Private (group admin only)
const updateGroupPhoto = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);

  if (!chat || chat.type !== 'group') {
    res.status(404);
    throw new Error('Group chat not found.');
  }

  if (!chat.groupAdmins.some((a) => a.toString() === req.user._id.toString())) {
    res.status(403);
    throw new Error('Only group admins can update the group photo.');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file.');
  }

  if (chat.groupPhoto?.publicId) {
    await deleteFromCloudinary(chat.groupPhoto.publicId);
  }

  chat.groupPhoto = { url: req.file.path, publicId: req.file.filename || extractPublicId(req.file.path) };
  await chat.save();

  res.status(200).json({ success: true, chat });
});

module.exports = {
  startOneToOneChat,
  createGroupChat,
  getMyChats,
  getChat,
  addParticipants,
  leaveGroupChat,
  updateGroupPhoto,
};
