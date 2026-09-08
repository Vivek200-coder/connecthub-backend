const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Society = require('../models/Society');
const Activity = require('../models/Activity');
const Business = require('../models/Business');
const Emergency = require('../models/Emergency');
const Report = require('../models/Report');
const Review = require('../models/Review');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

// ==========================================================
// DASHBOARD OVERVIEW
// ==========================================================

// @desc    High-level counts for the admin dashboard landing page
// @route   GET /api/admin/dashboard
// @access  Private (admin only)
const getDashboardOverview = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersLast30Days,
    totalSocieties,
    totalActivities,
    upcomingActivities,
    totalBusinesses,
    verifiedBusinesses,
    activeEmergencies,
    totalEmergencies,
    pendingReports,
    totalMessages,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Society.countDocuments({ isActive: true }),
    Activity.countDocuments(),
    Activity.countDocuments({ status: 'upcoming' }),
    Business.countDocuments({ isActive: true }),
    Business.countDocuments({ isActive: true, isVerified: true }),
    Emergency.countDocuments({ status: { $in: ['active', 'responding'] } }),
    Emergency.countDocuments(),
    Report.countDocuments({ status: 'pending' }),
    Message.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    overview: {
      users: { total: totalUsers, newLast30Days: newUsersLast30Days },
      societies: { total: totalSocieties },
      activities: { total: totalActivities, upcoming: upcomingActivities },
      businesses: { total: totalBusinesses, verified: verifiedBusinesses },
      emergencies: { active: activeEmergencies, total: totalEmergencies },
      reports: { pending: pendingReports },
      messages: { total: totalMessages },
    },
  });
});

// ==========================================================
// USER MANAGEMENT
// ==========================================================

// @desc    List/search/filter all users
// @route   GET /api/admin/users
// @access  Private (admin only)
const getUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isBanned !== undefined) filter.isBanned = req.query.isBanned === 'true';
  if (req.query.society) filter.society = req.query.society;
  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') },
      { phone: new RegExp(req.query.search, 'i') },
    ];
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('society', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: users.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    users,
  });
});

// @desc    Get single user's full profile (admin view)
// @route   GET /api/admin/users/:id
// @access  Private (admin only)
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('society', 'name address');

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  const [activityCount, businessCount, reportsAgainst] = await Promise.all([
    Activity.countDocuments({ createdBy: user._id }),
    Business.countDocuments({ owner: user._id }),
    Report.countDocuments({ targetType: 'User', targetId: user._id }),
  ]);

  res.status(200).json({
    success: true,
    user,
    stats: { activityCount, businessCount, reportsAgainst },
  });
});

// @desc    Ban a user
// @route   PATCH /api/admin/users/:id/ban
// @access  Private (admin only)
const banUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBanned: true, banReason: reason || 'Violation of community guidelines', refreshTokens: [] },
    { new: true }
  );

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  res.status(200).json({ success: true, message: 'User banned.', user });
});

// @desc    Unban a user
// @route   PATCH /api/admin/users/:id/unban
// @access  Private (admin only)
const unbanUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBanned: false, banReason: '' },
    { new: true }
  );

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  res.status(200).json({ success: true, message: 'User unbanned.', user });
});

// @desc    Change a user's role
// @route   PATCH /api/admin/users/:id/role
// @access  Private (admin only)
const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true, runValidators: true });

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  res.status(200).json({ success: true, message: 'User role updated.', user });
});

// @desc    Permanently delete a user account
// @route   DELETE /api/admin/users/:id
// @access  Private (admin only)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  // Clean up references elsewhere so deleted users don't leave dangling data
  await Promise.all([
    Society.updateMany({ members: user._id }, { $pull: { members: user._id, admins: user._id } }),
    Activity.updateMany({ participants: user._id }, { $pull: { participants: user._id, likes: user._id } }),
  ]);

  res.status(200).json({ success: true, message: 'User deleted permanently.' });
});

// ==========================================================
// BUSINESS MANAGEMENT
// ==========================================================

// @desc    List all businesses for moderation
// @route   GET /api/admin/businesses
// @access  Private (admin only)
const getBusinessesAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.isVerified !== undefined) filter.isVerified = req.query.isVerified === 'true';
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.category) filter.category = req.query.category;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [businesses, total] = await Promise.all([
    Business.find(filter)
      .populate('owner', 'name email phone')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Business.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: businesses.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    businesses,
  });
});

// @desc    Verify a business listing (adds trust badge)
// @route   PATCH /api/admin/businesses/:id/verify
// @access  Private (admin only)
const verifyBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  res.status(200).json({ success: true, message: 'Business verified.', business });
});

// @desc    Deactivate a business listing (hides it without deleting data)
// @route   PATCH /api/admin/businesses/:id/deactivate
// @access  Private (admin only)
const deactivateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  res.status(200).json({ success: true, message: 'Business deactivated.', business });
});

// ==========================================================
// ACTIVITY MANAGEMENT
// ==========================================================

// @desc    List all activities for moderation
// @route   GET /api/admin/activities
// @access  Private (admin only)
const getActivitiesAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [activities, total] = await Promise.all([
    Activity.find(filter)
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Activity.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: activities.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    activities,
  });
});

// @desc    Force-cancel an activity (moderation action)
// @route   PATCH /api/admin/activities/:id/cancel
// @access  Private (admin only)
const cancelActivityAdmin = asyncHandler(async (req, res) => {
  const activity = await Activity.findByIdAndUpdate(req.params.id, { status: 'cancelled' }, { new: true });

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  res.status(200).json({ success: true, message: 'Activity cancelled by admin.', activity });
});

// @desc    Delete an activity (moderation action)
// @route   DELETE /api/admin/activities/:id
// @access  Private (admin only)
const deleteActivityAdmin = asyncHandler(async (req, res) => {
  const activity = await Activity.findByIdAndDelete(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  res.status(200).json({ success: true, message: 'Activity deleted by admin.' });
});

// ==========================================================
// SOCIETY MANAGEMENT
// ==========================================================

// @desc    List all societies for moderation
// @route   GET /api/admin/societies
// @access  Private (admin only)
const getSocietiesAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.isVerified !== undefined) filter.isVerified = req.query.isVerified === 'true';

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [societies, total] = await Promise.all([
    Society.find(filter)
      .select('-notices')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Society.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: societies.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    societies,
  });
});

// @desc    Verify a society (adds trust badge)
// @route   PATCH /api/admin/societies/:id/verify
// @access  Private (admin only)
const verifySociety = asyncHandler(async (req, res) => {
  const society = await Society.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  res.status(200).json({ success: true, message: 'Society verified.', society });
});

// ==========================================================
// EMERGENCY MANAGEMENT
// ==========================================================

// @desc    List all emergencies (admin oversight, no status filter default)
// @route   GET /api/admin/emergencies
// @access  Private (admin only)
const getEmergenciesAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [emergencies, total] = await Promise.all([
    Emergency.find(filter)
      .populate('raisedBy', 'name phone email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Emergency.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: emergencies.length,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    emergencies,
  });
});

// @desc    Force-resolve an emergency (admin override)
// @route   PATCH /api/admin/emergencies/:id/force-resolve
// @access  Private (admin only)
const forceResolveEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findByIdAndUpdate(
    req.params.id,
    { status: 'resolved', resolvedAt: new Date(), resolvedBy: req.user._id, isLiveLocationActive: false },
    { new: true }
  );

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  const io = req.app.get('io');
  io.to(`emergency:${emergency._id}`).emit('emergency:resolved', { emergencyId: emergency._id });

  res.status(200).json({ success: true, message: 'Emergency force-resolved by admin.', emergency });
});

// ==========================================================
// ANALYTICS
// ==========================================================

// @desc    User signup growth over the last N days (default 30), grouped by day
// @route   GET /api/admin/analytics/users?days=30
// @access  Private (admin only)
const getUserAnalytics = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [growth, roleBreakdown, topSocieties] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { society: { $ne: null } } },
      { $group: { _id: '$society', memberCount: { $sum: 1 } } },
      { $sort: { memberCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'societies', localField: '_id', foreignField: '_id', as: 'society' } },
      { $unwind: '$society' },
      { $project: { memberCount: 1, 'society.name': 1, 'society.address.city': 1 } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    signupGrowth: growth.map((g) => ({ date: g._id, count: g.count })),
    roleBreakdown: roleBreakdown.map((r) => ({ role: r._id, count: r.count })),
    topSocietiesByMembers: topSocieties,
  });
});

// @desc    Activity engagement analytics — category breakdown, participation, top liked
// @route   GET /api/admin/analytics/activities
// @access  Private (admin only)
const getActivityAnalytics = asyncHandler(async (req, res) => {
  const [categoryBreakdown, statusBreakdown, topLiked, avgParticipation] = await Promise.all([
    Activity.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Activity.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Activity.aggregate([
      { $project: { title: 1, likeCount: { $size: '$likes' }, category: 1 } },
      { $sort: { likeCount: -1 } },
      { $limit: 10 },
    ]),
    Activity.aggregate([
      {
        $group: {
          _id: null,
          avgParticipants: { $avg: { $size: '$participants' } },
          avgComments: { $avg: { $size: '$comments' } },
        },
      },
    ]),
  ]);

  res.status(200).json({
    success: true,
    categoryBreakdown: categoryBreakdown.map((c) => ({ category: c._id, count: c.count })),
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
    topLikedActivities: topLiked,
    engagement: avgParticipation[0] || { avgParticipants: 0, avgComments: 0 },
  });
});

// @desc    Business directory analytics — category breakdown, top rated, ratings distribution
// @route   GET /api/admin/analytics/businesses
// @access  Private (admin only)
const getBusinessAnalytics = asyncHandler(async (req, res) => {
  const [categoryBreakdown, topRated, ratingsDistribution, totalReviews] = await Promise.all([
    Business.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 }, avgRating: { $avg: '$ratingsAverage' } } },
      { $sort: { count: -1 } },
    ]),
    Business.find({ isActive: true, ratingsCount: { $gt: 0 } })
      .sort('-ratingsAverage -ratingsCount')
      .limit(10)
      .select('businessName category ratingsAverage ratingsCount'),
    Review.aggregate([{ $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Review.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    categoryBreakdown: categoryBreakdown.map((c) => ({
      category: c._id,
      count: c.count,
      avgRating: Math.round((c.avgRating || 0) * 10) / 10,
    })),
    topRatedBusinesses: topRated,
    ratingsDistribution: ratingsDistribution.map((r) => ({ rating: r._id, count: r.count })),
    totalReviews,
  });
});

// @desc    Emergency analytics — type/status breakdown, response times
// @route   GET /api/admin/analytics/emergencies
// @access  Private (admin only)
const getEmergencyAnalytics = asyncHandler(async (req, res) => {
  const [typeBreakdown, statusBreakdown, avgResponders] = await Promise.all([
    Emergency.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Emergency.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Emergency.aggregate([
      { $project: { responderCount: { $size: '$respondedBy' } } },
      { $group: { _id: null, avgResponders: { $avg: '$responderCount' } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    typeBreakdown: typeBreakdown.map((t) => ({ type: t._id, count: t.count })),
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
    avgRespondersPerEmergency: Math.round((avgResponders[0]?.avgResponders || 0) * 10) / 10,
  });
});

// @desc    Moderation analytics — report volume by reason/target/status
// @route   GET /api/admin/analytics/reports
// @access  Private (admin only)
const getReportAnalytics = asyncHandler(async (req, res) => {
  const [reasonBreakdown, targetTypeBreakdown, statusBreakdown, avgResolutionHours] = await Promise.all([
    Report.aggregate([{ $group: { _id: '$reason', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Report.aggregate([{ $group: { _id: '$targetType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Report.aggregate([
      { $match: { reviewedAt: { $ne: null } } },
      { $project: { resolutionHours: { $divide: [{ $subtract: ['$reviewedAt', '$createdAt'] }, 1000 * 60 * 60] } } },
      { $group: { _id: null, avgHours: { $avg: '$resolutionHours' } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    reasonBreakdown: reasonBreakdown.map((r) => ({ reason: r._id, count: r.count })),
    targetTypeBreakdown: targetTypeBreakdown.map((t) => ({ targetType: t._id, count: t.count })),
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
    avgResolutionHours: Math.round((avgResolutionHours[0]?.avgHours || 0) * 10) / 10,
  });
});

module.exports = {
  getDashboardOverview,
  getUsers,
  getUserById,
  banUser,
  unbanUser,
  changeUserRole,
  deleteUser,
  getBusinessesAdmin,
  verifyBusiness,
  deactivateBusiness,
  getActivitiesAdmin,
  cancelActivityAdmin,
  deleteActivityAdmin,
  getSocietiesAdmin,
  verifySociety,
  getEmergenciesAdmin,
  forceResolveEmergency,
  getUserAnalytics,
  getActivityAnalytics,
  getBusinessAnalytics,
  getEmergencyAnalytics,
  getReportAnalytics,
};
