const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true });

const { sendMessage, getMessages, markMessagesRead, deleteMessage } = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadChatImages } = require('../config/cloudinary');

router.use(protect);

router.get('/', getMessages);
router.post(
  '/',
  uploadChatImages.single('image'),
  [
    body('text')
      .if((value, { req }) => !req.file)
      .trim()
      .notEmpty()
      .withMessage('Message text is required when no image is attached')
      .isLength({ max: 5000 })
      .withMessage('Message cannot exceed 5000 characters'),
  ],
  validate,
  sendMessage
);
router.patch('/read', markMessagesRead);
router.delete('/:messageId', deleteMessage);

module.exports = router;
