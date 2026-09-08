const asyncHandler = require('express-async-handler');
const Activity = require('../models/Activity');
const ApiFeatures = require('../utils/apiFeatures');
const { deleteFromCloudinary, extractPublicId } = require('../config/cloudinary');

// @desc    Create a new activity
// @route   POST /api/activities
// @access  Private
const createActivity = asyncHandler(async (req, res) => {
  const { title, description, category, location, date, time, maxMembers, society } = req.body;

  const images = (req.files || []).map((f) => ({
    url: f.path,
    publicId: f.filename || extractPublicId(f.path),
  }));

  const activity = await Activity.create({
    title,
    description,
    category,
    location,
    date,
    time,
    maxMembers,
    society: society || req.user.society || null,
    images,
    createdBy: req.user._id,
    participants: [req.user._id], // creator auto-joins
  });

  res.status(201).json({ success: true, activity });
});

// @desc    Get all activities (search/filter/paginate)
// @route   GET /api/activities
// @access  Public
const getActivities = asyncHandler(async (req, res) => {
  const baseFilter = {};
  if (req.query.society) baseFilter.society = req.query.society;
  if (req.query.status) baseFilter.status = req.query.status;
  if (req.query.dateFrom || req.query.dateTo) {
    baseFilter.date = {};
    if (req.query.dateFrom) baseFilter.date.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) baseFilter.date.$lte = new Date(req.query.dateTo);
  }

  const features = new ApiFeatures(Activity.find(baseFilter), req.query)
    .search(['title', 'description'])
    .filter(['category'])
    .sort('date')
    .paginate();

  const activities = await features.query
    .populate('createdBy', 'name profilePhoto')
    .populate('society', 'name');

  const meta = await features.getMeta(Activity, baseFilter);

  res.status(200).json({ success: true, count: activities.length, meta, activities });
});

// @desc    Get single activity
// @route   GET /api/activities/:id
// @access  Public
const getActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id)
    .populate('createdBy', 'name profilePhoto')
    .populate('participants', 'name profilePhoto')
    .populate('society', 'name')
    .populate('comments.user', 'name profilePhoto');

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  res.status(200).json({ success: true, activity });
});

// @desc    Update activity
// @route   PATCH /api/activities/:id
// @access  Private (creator only)
const updateActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  if (activity.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to update this activity.');
  }

  const allowedFields = [
    'title',
    'description',
    'category',
    'location',
    'date',
    'time',
    'maxMembers',
    'status',
  ];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) activity[field] = req.body[field];
  });

  if (req.files && req.files.length) {
    const newImages = req.files.map((f) => ({ url: f.path, publicId: f.filename || extractPublicId(f.path) }));
    activity.images.push(...newImages);
  }

  await activity.save();
  res.status(200).json({ success: true, activity });
});

// @desc    Delete activity
// @route   DELETE /api/activities/:id
// @access  Private (creator only)
const deleteActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  if (activity.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to delete this activity.');
  }

  await Promise.all((activity.images || []).map((img) => deleteFromCloudinary(img.publicId)));
  await Activity.findByIdAndDelete(req.params.id);

  res.status(200).json({ success: true, message: 'Activity deleted successfully.' });
});

// @desc    Join an activity
// @route   POST /api/activities/:id/join
// @access  Private
const joinActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  if (activity.status !== 'upcoming') {
    res.status(400);
    throw new Error('You can only join activities that are still upcoming.');
  }

  if (activity.participants.some((p) => p.toString() === req.user._id.toString())) {
    res.status(400);
    throw new Error('You have already joined this activity.');
  }

  if (activity.participants.length >= activity.maxMembers) {
    res.status(400);
    throw new Error('This activity has reached its maximum number of participants.');
  }

  activity.participants.push(req.user._id);
  await activity.save();

  res.status(200).json({
    success: true,
    message: 'Joined activity successfully.',
    participantCount: activity.participants.length,
  });
});

// @desc    Leave an activity
// @route   POST /api/activities/:id/leave
// @access  Private
const leaveActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  if (activity.createdBy.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('The organizer cannot leave their own activity. Delete or cancel it instead.');
  }

  activity.participants = activity.participants.filter(
    (p) => p.toString() !== req.user._id.toString()
  );
  await activity.save();

  res.status(200).json({
    success: true,
    message: 'Left activity successfully.',
    participantCount: activity.participants.length,
  });
});

// @desc    Like / unlike an activity (toggle)
// @route   POST /api/activities/:id/like
// @access  Private
const toggleLike = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  const alreadyLiked = activity.likes.some((l) => l.toString() === req.user._id.toString());

  if (alreadyLiked) {
    activity.likes = activity.likes.filter((l) => l.toString() !== req.user._id.toString());
  } else {
    activity.likes.push(req.user._id);
  }

  await activity.save();

  res.status(200).json({
    success: true,
    liked: !alreadyLiked,
    likeCount: activity.likes.length,
  });
});

// @desc    Add a comment
// @route   POST /api/activities/:id/comments
// @access  Private
const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  activity.comments.push({ user: req.user._id, text });
  await activity.save();
  await Activity.populate(activity, { path: 'comments.user', select: 'name profilePhoto' });

  res.status(201).json({ success: true, comment: activity.comments[activity.comments.length - 1] });
});

// @desc    Delete a comment
// @route   DELETE /api/activities/:id/comments/:commentId
// @access  Private (comment author, activity creator, or admin)
const deleteComment = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  const comment = activity.comments.id(req.params.commentId);
  if (!comment) {
    res.status(404);
    throw new Error('Comment not found.');
  }

  const isAuthor = comment.user.toString() === req.user._id.toString();
  const isOrganizer = activity.createdBy.toString() === req.user._id.toString();

  if (!isAuthor && !isOrganizer && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to delete this comment.');
  }

  comment.deleteOne();
  await activity.save();

  res.status(200).json({ success: true, message: 'Comment deleted successfully.' });
});

// @desc    Share an activity (increments share count, returns shareable link)
// @route   POST /api/activities/:id/share
// @access  Private
const shareActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findByIdAndUpdate(
    req.params.id,
    { $inc: { shareCount: 1 } },
    { new: true }
  );

  if (!activity) {
    res.status(404);
    throw new Error('Activity not found.');
  }

  res.status(200).json({
    success: true,
    shareCount: activity.shareCount,
    shareUrl: `${process.env.CLIENT_URL}/activities/${activity._id}`,
  });
});

module.exports = {
  createActivity,
  getActivities,
  getActivity,
  updateActivity,
  deleteActivity,
  joinActivity,
  leaveActivity,
  toggleLike,
  addComment,
  deleteComment,
  shareActivity,
};
