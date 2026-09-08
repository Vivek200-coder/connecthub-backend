const asyncHandler = require('express-async-handler');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { extractPublicId } = require('../config/cloudinary');
const { createNotification } = require('./notificationController');

const assertParticipant = (chat, userId, res) => {
  if (!chat.participants.some((p) => p.toString() === userId.toString())) {
    res.status(403);
    throw new Error('You are not a participant of this chat.');
  }
};

// @desc    Send a message (text or image) via REST — also used as fallback
//          when the client isn't connected over Socket.io
// @route   POST /api/chats/:chatId/messages
// @access  Private (participant only)
const sendMessage = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat not found.');
  }
  assertParticipant(chat, req.user._id, res);

  const messageData = {
    chat: chat._id,
    sender: req.user._id,
    readBy: [{ user: req.user._id }], // sender has implicitly "read" their own message
  };

  if (req.file) {
    messageData.type = 'image';
    messageData.image = { url: req.file.path, publicId: req.file.filename || extractPublicId(req.file.path) };
  } else {
    messageData.type = 'text';
    messageData.text = text;
  }

  const message = await Message.create(messageData);
  await message.populate('sender', 'name profilePhoto');

  chat.lastMessage = message._id;
  chat.lastMessageAt = new Date();

  // Bump unread counters for everyone except the sender
  chat.participants.forEach((p) => {
    const pid = p.toString();
    if (pid !== req.user._id.toString()) {
      chat.unreadCounts.set(pid, (chat.unreadCounts.get(pid) || 0) + 1);
    }
  });
  await chat.save();

  const io = req.app.get('io');
  chat.participants
    .filter((p) => p.toString() !== req.user._id.toString())
    .forEach((p) => {
      io.to(p.toString()).emit('message:new', message);
    });

  // Persisted notification for offline users
  await Promise.all(
    chat.participants
      .filter((p) => p.toString() !== req.user._id.toString())
      .map((p) =>
        createNotification({
          user: p,
          type: 'new_message',
          title: req.user.name,
          body: message.type === 'text' ? message.text.slice(0, 100) : 'Sent an image',
          relatedId: chat._id,
          relatedModel: 'Chat',
          io,
        })
      )
  );

  res.status(201).json({ success: true, message });
});

// @desc    Get message history for a chat (paginated, newest last)
// @route   GET /api/chats/:chatId/messages
// @access  Private (participant only)
const getMessages = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat not found.');
  }
  assertParticipant(chat, req.user._id, res);

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  const [messages, total] = await Promise.all([
    Message.find({ chat: chat._id, isDeleted: false })
      .populate('sender', 'name profilePhoto')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Message.countDocuments({ chat: chat._id, isDeleted: false }),
  ]);

  res.status(200).json({
    success: true,
    count: messages.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    messages: messages.reverse(), // oldest first for chat rendering
  });
});

// @desc    Mark all messages in a chat as read by current user
// @route   PATCH /api/chats/:chatId/messages/read
// @access  Private (participant only)
const markMessagesRead = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    res.status(404);
    throw new Error('Chat not found.');
  }
  assertParticipant(chat, req.user._id, res);

  await Message.updateMany(
    { chat: chat._id, 'readBy.user': { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, readAt: new Date() } } }
  );

  chat.unreadCounts.set(req.user._id.toString(), 0);
  await chat.save();

  const io = req.app.get('io');
  chat.participants
    .filter((p) => p.toString() !== req.user._id.toString())
    .forEach((p) => {
      io.to(p.toString()).emit('message:read', { chatId: chat._id, readBy: req.user._id });
    });

  res.status(200).json({ success: true, message: 'Messages marked as read.' });
});

// @desc    Delete a message (for everyone, sender only)
// @route   DELETE /api/chats/:chatId/messages/:messageId
// @access  Private (sender only)
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.messageId);

  if (!message) {
    res.status(404);
    throw new Error('Message not found.');
  }

  if (message.sender.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('You can only delete your own messages.');
  }

  message.isDeleted = true;
  message.deletedForEveryone = true;
  message.text = '';
  await message.save();

  const io = req.app.get('io');
  io.to(`chat:${message.chat}`).emit('message:deleted', { messageId: message._id, chatId: message.chat });

  res.status(200).json({ success: true, message: 'Message deleted.' });
});

module.exports = { sendMessage, getMessages, markMessagesRead, deleteMessage };
