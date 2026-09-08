const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  startOneToOneChat,
  createGroupChat,
  getMyChats,
  getChat,
  addParticipants,
  leaveGroupChat,
  updateGroupPhoto,
} = require('../controllers/chatController');

const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadChatImages } = require('../config/cloudinary');
const messageRoutes = require('./messageRoutes');

router.use(protect);

// Nested: /api/chats/:chatId/messages
router.use('/:chatId/messages', messageRoutes);

router.get('/', getMyChats);

router.post(
  '/one-to-one',
  [body('userId').isMongoId().withMessage('Valid userId is required')],
  validate,
  startOneToOneChat
);

router.post(
  '/group',
  [
    body('groupName').trim().isLength({ min: 2, max: 100 }).withMessage('Group name must be 2-100 characters'),
    body('participantIds').isArray({ min: 2 }).withMessage('At least 2 other participants are required'),
  ],
  validate,
  createGroupChat
);

router.get('/:id', getChat);
router.post(
  '/:id/participants',
  [body('userIds').isArray({ min: 1 }).withMessage('userIds must be a non-empty array')],
  validate,
  addParticipants
);
router.post('/:id/leave', leaveGroupChat);
router.patch('/:id/photo', uploadChatImages.single('photo'), updateGroupPhoto);

module.exports = router;
