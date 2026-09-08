const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  createSociety,
  getSocieties,
  getSociety,
  updateSociety,
  deleteSociety,
  joinSociety,
  approveJoinRequest,
  leaveSociety,
  addCommitteeMember,
  removeCommitteeMember,
  addNotice,
  getNotices,
  deleteNotice,
} = require('../controllers/societyController');

const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const societyValidation = [
  body('name').trim().isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
  body('address.street').trim().notEmpty().withMessage('Street address is required'),
  body('address.city').trim().notEmpty().withMessage('City is required'),
  body('address.state').trim().notEmpty().withMessage('State is required'),
  body('address.pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
];

router.get('/', getSocieties);
router.post('/', protect, societyValidation, validate, createSociety);

router.get('/:id', getSociety);
router.patch('/:id', protect, updateSociety);
router.delete('/:id', protect, deleteSociety);

router.post(
  '/:id/join',
  protect,
  [body('flatNumber').optional().trim(), body('block').optional().trim()],
  validate,
  joinSociety
);
router.post('/:id/approve/:userId', protect, approveJoinRequest);
router.post('/:id/leave', protect, leaveSociety);

router.post(
  '/:id/committee',
  protect,
  [
    body('userId').isMongoId().withMessage('Valid userId is required'),
    body('position')
      .isIn(['president', 'vice_president', 'secretary', 'treasurer', 'committee_member'])
      .withMessage('Invalid committee position'),
  ],
  validate,
  addCommitteeMember
);
router.delete('/:id/committee/:memberId', protect, removeCommitteeMember);

router.get('/:id/notices', protect, getNotices);
router.post(
  '/:id/notices',
  protect,
  [
    body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
    body('content').trim().isLength({ min: 3, max: 3000 }).withMessage('Content must be 3-3000 characters'),
    body('type')
      .optional()
      .isIn(['notice', 'announcement', 'maintenance', 'complaint_update', 'event'])
      .withMessage('Invalid notice type'),
  ],
  validate,
  addNotice
);
router.delete('/:id/notices/:noticeId', protect, deleteNotice);

module.exports = router;
