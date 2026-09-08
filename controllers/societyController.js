const asyncHandler = require('express-async-handler');
const Society = require('../models/Society');
const User = require('../models/User');
const { deleteFromCloudinary } = require('../config/cloudinary');

// @desc    Create a new society
// @route   POST /api/societies
// @access  Private
const createSociety = asyncHandler(async (req, res) => {
  const { name, description, address, totalFlats, totalBlocks, amenities, joinPolicy, location } = req.body;

  const society = await Society.create({
    name,
    description,
    address,
    totalFlats,
    totalBlocks,
    amenities,
    joinPolicy,
    location: location?.coordinates ? location : undefined,
    createdBy: req.user._id,
    admins: [req.user._id],
    members: [req.user._id],
    committeeMembers: [{ user: req.user._id, position: 'president' }],
  });

  // Auto-join the creator to the society they made
  await User.findByIdAndUpdate(req.user._id, { society: society._id });

  res.status(201).json({ success: true, society });
});

// @desc    Get all societies (search/filter/paginate)
// @route   GET /api/societies
// @access  Public
const getSocieties = asyncHandler(async (req, res) => {
  const { search, city } = req.query;
  const filter = { isActive: true };

  if (city) filter['address.city'] = new RegExp(city, 'i');
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { 'address.city': new RegExp(search, 'i') },
    ];
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [societies, total] = await Promise.all([
    Society.find(filter)
      .select('-notices -pendingJoinRequests')
      .populate('createdBy', 'name profilePhoto')
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

// @desc    Get single society by ID
// @route   GET /api/societies/:id
// @access  Public
const getSociety = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id)
    .populate('createdBy', 'name profilePhoto')
    .populate('committeeMembers.user', 'name profilePhoto phone')
    .populate('members', 'name profilePhoto flatNumber block')
    .populate('notices.postedBy', 'name profilePhoto');

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  res.status(200).json({ success: true, society });
});

// @desc    Update society details
// @route   PATCH /api/societies/:id
// @access  Private (manager only)
const updateSociety = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (!society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to update this society.');
  }

  const allowedFields = [
    'name',
    'description',
    'address',
    'totalFlats',
    'totalBlocks',
    'amenities',
    'joinPolicy',
    'location',
  ];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) society[field] = req.body[field];
  });

  await society.save();

  res.status(200).json({ success: true, society });
});

// @desc    Delete (deactivate) a society
// @route   DELETE /api/societies/:id
// @access  Private (creator or admin only)
const deleteSociety = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (society.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only the society creator or an admin can delete this society.');
  }

  // Clean up gallery images from Cloudinary
  await Promise.all((society.images || []).map((img) => deleteFromCloudinary(img.publicId)));

  await Society.findByIdAndDelete(req.params.id);
  await User.updateMany({ society: society._id }, { $unset: { society: '' } });

  res.status(200).json({ success: true, message: 'Society deleted successfully.' });
});

// @desc    Join a society
// @route   POST /api/societies/:id/join
// @access  Private
const joinSociety = asyncHandler(async (req, res) => {
  const { flatNumber, block } = req.body;
  const society = await Society.findById(req.params.id);

  if (!society || !society.isActive) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (society.members.some((m) => m.toString() === req.user._id.toString())) {
    res.status(400);
    throw new Error('You are already a member of this society.');
  }

  if (society.joinPolicy === 'approval_required') {
    if (society.pendingJoinRequests.some((r) => r.user.toString() === req.user._id.toString())) {
      res.status(400);
      throw new Error('You already have a pending join request for this society.');
    }
    society.pendingJoinRequests.push({ user: req.user._id, flatNumber, block });
    await society.save();
    return res.status(200).json({ success: true, message: 'Join request submitted for approval.' });
  }

  society.members.push(req.user._id);
  await society.save();
  await User.findByIdAndUpdate(req.user._id, {
    society: society._id,
    flatNumber: flatNumber || req.user.flatNumber,
    block: block || req.user.block,
  });

  res.status(200).json({ success: true, message: 'Joined society successfully.', society });
});

// @desc    Approve a pending join request (managers only)
// @route   POST /api/societies/:id/approve/:userId
// @access  Private (manager only)
const approveJoinRequest = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (!society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to approve join requests.');
  }

  const request = society.pendingJoinRequests.find((r) => r.user.toString() === req.params.userId);

  if (!request) {
    res.status(404);
    throw new Error('No pending join request found for this user.');
  }

  society.members.push(request.user);
  society.pendingJoinRequests = society.pendingJoinRequests.filter(
    (r) => r.user.toString() !== req.params.userId
  );
  await society.save();

  await User.findByIdAndUpdate(request.user, {
    society: society._id,
    flatNumber: request.flatNumber,
    block: request.block,
  });

  res.status(200).json({ success: true, message: 'Join request approved.' });
});

// @desc    Leave a society
// @route   POST /api/societies/:id/leave
// @access  Private
const leaveSociety = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (society.createdBy.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('The society creator cannot leave. Transfer ownership or delete the society instead.');
  }

  society.members = society.members.filter((m) => m.toString() !== req.user._id.toString());
  society.admins = society.admins.filter((a) => a.toString() !== req.user._id.toString());
  society.committeeMembers = society.committeeMembers.filter(
    (c) => c.user.toString() !== req.user._id.toString()
  );
  await society.save();

  await User.findByIdAndUpdate(req.user._id, { $unset: { society: '' } });

  res.status(200).json({ success: true, message: 'Left society successfully.' });
});

// @desc    Add a committee member
// @route   POST /api/societies/:id/committee
// @access  Private (manager only)
const addCommitteeMember = asyncHandler(async (req, res) => {
  const { userId, position } = req.body;
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (!society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to manage the committee.');
  }

  if (!society.members.some((m) => m.toString() === userId)) {
    res.status(400);
    throw new Error('User must be a member of the society before joining the committee.');
  }

  if (society.committeeMembers.some((c) => c.user.toString() === userId)) {
    res.status(400);
    throw new Error('User is already a committee member.');
  }

  society.committeeMembers.push({ user: userId, position });
  await society.save();
  await Society.populate(society, { path: 'committeeMembers.user', select: 'name profilePhoto phone' });

  res.status(201).json({ success: true, committeeMembers: society.committeeMembers });
});

// @desc    Remove a committee member
// @route   DELETE /api/societies/:id/committee/:memberId
// @access  Private (manager only)
const removeCommitteeMember = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (!society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to manage the committee.');
  }

  const before = society.committeeMembers.length;
  society.committeeMembers = society.committeeMembers.filter(
    (c) => c._id.toString() !== req.params.memberId
  );

  if (society.committeeMembers.length === before) {
    res.status(404);
    throw new Error('Committee member not found.');
  }

  await society.save();
  res.status(200).json({ success: true, committeeMembers: society.committeeMembers });
});

// @desc    Post a notice or announcement
// @route   POST /api/societies/:id/notices
// @access  Private (manager only)
const addNotice = asyncHandler(async (req, res) => {
  const { title, content, type, isPinned, expiresAt } = req.body;
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  if (!society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only committee members can post notices.');
  }

  society.notices.unshift({
    title,
    content,
    type: type || 'notice',
    isPinned: !!isPinned,
    expiresAt: expiresAt || null,
    postedBy: req.user._id,
  });

  await society.save();
  await Society.populate(society, { path: 'notices.postedBy', select: 'name profilePhoto' });

  res.status(201).json({ success: true, notice: society.notices[0] });
});

// @desc    Get all notices/announcements for a society
// @route   GET /api/societies/:id/notices
// @access  Private (members only)
const getNotices = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id).populate('notices.postedBy', 'name profilePhoto');

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  let notices = society.notices.filter((n) => !n.expiresAt || n.expiresAt > Date.now());
  if (req.query.type) notices = notices.filter((n) => n.type === req.query.type);

  notices = notices.sort((a, b) => (b.isPinned - a.isPinned) || (b.createdAt - a.createdAt));

  res.status(200).json({ success: true, count: notices.length, notices });
});

// @desc    Delete a notice
// @route   DELETE /api/societies/:id/notices/:noticeId
// @access  Private (manager or original poster)
const deleteNotice = asyncHandler(async (req, res) => {
  const society = await Society.findById(req.params.id);

  if (!society) {
    res.status(404);
    throw new Error('Society not found.');
  }

  const notice = society.notices.id(req.params.noticeId);
  if (!notice) {
    res.status(404);
    throw new Error('Notice not found.');
  }

  const isPoster = notice.postedBy.toString() === req.user._id.toString();
  if (!isPoster && !society.isManager(req.user._id) && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to delete this notice.');
  }

  notice.deleteOne();
  await society.save();

  res.status(200).json({ success: true, message: 'Notice deleted successfully.' });
});

module.exports = {
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
};
