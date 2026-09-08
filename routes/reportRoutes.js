const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { createReport, getMyReports, getAllReports, updateReportStatus } = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');

const TARGET_TYPES = ['User', 'Business', 'Activity', 'Message', 'Society', 'Review'];
const REASONS = [
  'spam',
  'harassment',
  'inappropriate_content',
  'fake_listing',
  'fraud_scam',
  'hate_speech',
  'violence_threat',
  'impersonation',
  'other',
];

router.use(protect);

router.post(
  '/',
  [
    body('targetType').isIn(TARGET_TYPES).withMessage('Invalid targetType'),
    body('targetId').isMongoId().withMessage('Valid targetId is required'),
    body('reason').isIn(REASONS).withMessage('Invalid reason'),
    body('description').optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  createReport
);

router.get('/my-reports', getMyReports);

router.get('/', restrictTo('admin'), getAllReports);
router.patch(
  '/:id',
  restrictTo('admin'),
  [
    body('status').isIn(['pending', 'under_review', 'action_taken', 'dismissed']).withMessage('Invalid status'),
    body('reviewNote').optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  updateReportStatus
);

module.exports = router;
