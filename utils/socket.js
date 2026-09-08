const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

/**
 * Initializes Socket.io with JWT-authenticated connections.
 *
 * Rooms used:
 *   - `<userId>`        personal room, joined automatically — used for
 *                       notifications, direct message pushes, emergency alerts
 *   - `chat:<chatId>`   joined on demand via `chat:join` — used for typing
 *                       indicators and message broadcasts scoped to a conversation
 *   - `emergency:<id>`  joined via `emergency:join` — used for live location
 *                       updates while an SOS is active
 */
const onlineUsers = new Map(); // userId -> Set of socket ids

const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Authentication token missing'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user || !user.isActive || user.isBanned) {
        return next(new Error('Unauthorized'));
      }

      socket.userId = user._id.toString();
      socket.userName = user.name;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    socket.join(userId); // personal room for direct notifications/messages
    io.emit('user:online', { userId });

    // ---------- Chat room management ----------
    socket.on('chat:join', async (chatId) => {
      try {
        const chat = await Chat.findById(chatId);
        if (chat && chat.participants.some((p) => p.toString() === userId)) {
          socket.join(`chat:${chatId}`);
        }
      } catch (err) {
        socket.emit('error', { message: 'Failed to join chat room.' });
      }
    });

    socket.on('chat:leave', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // ---------- Typing indicators ----------
    socket.on('typing:start', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId, userName: socket.userName });
    });

    socket.on('typing:stop', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    // ---------- Real-time message send over socket (mirrors REST endpoint) ----------
    socket.on('message:send', async ({ chatId, text }, callback) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.some((p) => p.toString() === userId)) {
          return callback?.({ success: false, message: 'Not a participant of this chat.' });
        }

        const message = await Message.create({
          chat: chatId,
          sender: userId,
          type: 'text',
          text,
          readBy: [{ user: userId }],
        });
        await message.populate('sender', 'name profilePhoto');

        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        chat.participants.forEach((p) => {
          const pid = p.toString();
          if (pid !== userId) chat.unreadCounts.set(pid, (chat.unreadCounts.get(pid) || 0) + 1);
        });
        await chat.save();

        io.to(`chat:${chatId}`).emit('message:new', message);
        chat.participants
          .filter((p) => p.toString() !== userId)
          .forEach((p) => io.to(p.toString()).emit('message:new', message));

        callback?.({ success: true, message });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // ---------- Read receipts ----------
    socket.on('message:read', async ({ chatId }) => {
      try {
        await Message.updateMany(
          { chat: chatId, 'readBy.user': { $ne: userId } },
          { $push: { readBy: { user: userId, readAt: new Date() } } }
        );
        const chat = await Chat.findById(chatId);
        if (chat) {
          chat.unreadCounts.set(userId, 0);
          await chat.save();
        }
        socket.to(`chat:${chatId}`).emit('message:read', { chatId, readBy: userId });
      } catch (err) {
        socket.emit('error', { message: 'Failed to mark messages as read.' });
      }
    });

    // ---------- Emergency live-location rooms ----------
    socket.on('emergency:join', (emergencyId) => {
      socket.join(`emergency:${emergencyId}`);
    });

    socket.on('emergency:leave', (emergencyId) => {
      socket.leave(`emergency:${emergencyId}`);
    });

    // ---------- Disconnect / presence ----------
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', { userId });
        }
      }
    });
  });
};

const isUserOnline = (userId) => onlineUsers.has(userId.toString());

module.exports = initSocket;
module.exports.isUserOnline = isUserOnline;
