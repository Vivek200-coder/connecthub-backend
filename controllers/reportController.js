const asyncHandler = require('express-async-handler');
const Report = require('../models/Report');

// @desc    File a report against a user, business, activity, message, society, or review
// @route   POST /api/reports
// @access  Private
const createReport = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, description } = req.body;

  const duplicate = await Report.findOne({
    reportedBy: req.user._id,
    targetType,
    targetId,
    status: { $in: ['pending', 'under_review'] },
  });

  if (duplicate) {
    res.status(400);
    throw new Error('You already have a pending report for this item.');
  }

  const report = await Report.create({
    reportedBy: req.user._id,
    targetType,
    targetId,
    reason,
    description,
  });

  res.status(201).json({ success: true, report });
});

// @desc    Get current user's own filed reports
// @route   GET /api/reports/my-reports
// @access  Private
const getMyReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ reportedBy: req.user._id }).sort('-createdAt');
  res.status(200).json({ success: true, count: reports.length, reports });
});

// @desc    Get all reports (admin moderation queue)
// @route   GET /api/reports
// @access  Private (admin only)
const getAllReports = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.targetType) filter.targetType = req.query.targetType;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate('reportedBy', 'name email phone')
      .populate('reviewedBy', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Report.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: reports.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    reports,
  });
});

// @desc    Update report status (admin moderation action)
// @route   PATCH /api/reports/:id
// @access  Private (admin only)
const updateReportStatus = asyncHandler(async (req, res) => {
  const { status, reviewNote } = req.body;

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status, reviewNote, reviewedBy: req.user._id, reviewedAt: new Date() },
    { new: true, runValidators: true }
  );

  if (!report) {
    res.status(404);
    throw new Error('Report not found.');
  }

  res.status(200).json({ success: true, report });
});

module.exports = { createReport, getMyReports, getAllReports, updateReportStatus };
