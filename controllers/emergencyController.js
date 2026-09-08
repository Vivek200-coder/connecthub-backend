const asyncHandler = require('express-async-handler');
const Emergency = require('../models/Emergency');
const User = require('../models/User');
const { sendPushToUsers } = require('../utils/pushNotification');
const { createNotification } = require('./notificationController');

// @desc    Raise an emergency (SOS, medical, blood, fire, security, accident)
// @route   POST /api/emergency
// @access  Private
const createEmergency = asyncHandler(async (req, res) => {
  const {
    type,
    description,
    location,
    bloodGroup,
    unitsNeeded,
    hospitalName,
    contactPhone,
  } = req.body;

  if (!location || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
    res.status(400);
    throw new Error('Valid location coordinates [longitude, latitude] are required.');
  }

  const emergency = await Emergency.create({
    type,
    description,
    location,
    bloodGroup: type === 'blood_requirement' ? bloodGroup : null,
    unitsNeeded: type === 'blood_requirement' ? unitsNeeded : null,
    hospitalName,
    contactPhone: contactPhone || req.user.phone,
    society: req.user.society || null,
    raisedBy: req.user._id,
  });

  await emergency.populate('raisedBy', 'name phone profilePhoto');

  // Notify society members in real time + push
  const io = req.app.get('io');
  if (req.user.society) {
    const members = await User.find({ society: req.user.society, _id: { $ne: req.user._id } }).select(
      '_id fcmTokens'
    );
    const memberIds = members.map((m) => m._id.toString());

    memberIds.forEach((id) => io.to(id).emit('emergency:new', emergency));

    await Promise.all(
      memberIds.map((id) =>
        createNotification({
          user: id,
          type: 'emergency_alert',
          title: `${type.replace('_', ' ').toUpperCase()} Alert`,
          body: `${req.user.name} raised an emergency: ${description || type}`,
          relatedId: emergency._id,
          relatedModel: 'Emergency',
        })
      )
    );

    const tokens = members.flatMap((m) => m.fcmTokens || []);
    if (tokens.length) {
      await sendPushToUsers(tokens, {
        title: `${type.replace('_', ' ').toUpperCase()} Alert`,
        body: `${req.user.name} raised an emergency nearby.`,
        data: { type: 'emergency_alert', emergencyId: emergency._id.toString() },
      });
    }
  }

  res.status(201).json({ success: true, emergency });
});

// @desc    Get all emergencies (filterable by society, type, status)
// @route   GET /api/emergency
// @access  Private
const getEmergencies = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.society) filter.society = req.query.society;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  else filter.status = { $ne: 'cancelled' };

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [emergencies, total] = await Promise.all([
    Emergency.find(filter)
      .populate('raisedBy', 'name phone profilePhoto')
      .populate('respondedBy.user', 'name phone profilePhoto')
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

// @desc    Get a single emergency
// @route   GET /api/emergency/:id
// @access  Private
const getEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findById(req.params.id)
    .populate('raisedBy', 'name phone profilePhoto')
    .populate('respondedBy.user', 'name phone profilePhoto');

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  res.status(200).json({ success: true, emergency });
});

// @desc    Push a live location update while an emergency is active
// @route   POST /api/emergency/:id/location
// @access  Private (raiser only)
const updateLiveLocation = asyncHandler(async (req, res) => {
  const { coordinates } = req.body;
  const emergency = await Emergency.findById(req.params.id);

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  if (emergency.raisedBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Only the person who raised this emergency can update its live location.');
  }

  if (!emergency.isLiveLocationActive || emergency.status === 'resolved' || emergency.status === 'cancelled') {
    res.status(400);
    throw new Error('Live location sharing is no longer active for this emergency.');
  }

  emergency.locationUpdates.push({ coordinates });
  emergency.location.coordinates = coordinates;
  await emergency.save();

  const io = req.app.get('io');
  io.to(`emergency:${emergency._id}`).emit('emergency:location_update', {
    emergencyId: emergency._id,
    coordinates,
    recordedAt: new Date(),
  });

  res.status(200).json({ success: true, message: 'Location updated.' });
});

// @desc    Respond to an emergency (neighbor/committee acknowledging)
// @route   POST /api/emergency/:id/respond
// @access  Private
const respondToEmergency = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const emergency = await Emergency.findById(req.params.id);

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  if (emergency.respondedBy.some((r) => r.user.toString() === req.user._id.toString())) {
    res.status(400);
    throw new Error('You have already responded to this emergency.');
  }

  emergency.respondedBy.push({ user: req.user._id, note });
  if (emergency.status === 'active') emergency.status = 'responding';
  await emergency.save();
  await emergency.populate('respondedBy.user', 'name phone profilePhoto');

  const io = req.app.get('io');
  io.to(emergency.raisedBy.toString()).emit('emergency:responded', {
    emergencyId: emergency._id,
    responder: req.user.name,
  });

  res.status(200).json({ success: true, emergency });
});

// @desc    Mark an emergency as resolved
// @route   PATCH /api/emergency/:id/resolve
// @access  Private (raiser, society manager, or admin)
const resolveEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findById(req.params.id);

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  emergency.status = 'resolved';
  emergency.resolvedAt = new Date();
  emergency.resolvedBy = req.user._id;
  emergency.isLiveLocationActive = false;
  await emergency.save();

  const io = req.app.get('io');
  io.to(`emergency:${emergency._id}`).emit('emergency:resolved', { emergencyId: emergency._id });

  res.status(200).json({ success: true, message: 'Emergency marked as resolved.', emergency });
});

// @desc    Cancel a false alarm / mistaken SOS
// @route   PATCH /api/emergency/:id/cancel
// @access  Private (raiser only)
const cancelEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findById(req.params.id);

  if (!emergency) {
    res.status(404);
    throw new Error('Emergency not found.');
  }

  if (emergency.raisedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only the person who raised this emergency can cancel it.');
  }

  emergency.status = 'cancelled';
  emergency.isLiveLocationActive = false;
  await emergency.save();

  res.status(200).json({ success: true, message: 'Emergency cancelled.' });
});

// @desc    Get user's saved emergency contacts (personal + standard services)
// @route   GET /api/emergency/contacts
// @access  Private
const getEmergencyContacts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('emergencyContacts');

  const standardServices = [
    { name: 'Police', phone: '100' },
    { name: 'Ambulance', phone: '108' },
    { name: 'Fire Brigade', phone: '101' },
    { name: 'Women Helpline', phone: '1091' },
    { name: 'Disaster Management', phone: '108' },
    { name: 'National Emergency Number', phone: '112' },
  ];

  res.status(200).json({
    success: true,
    personalContacts: user.emergencyContacts,
    standardServices,
  });
});

// @desc    Add a personal emergency contact
// @route   POST /api/emergency/contacts
// @access  Private
const addEmergencyContact = asyncHandler(async (req, res) => {
  const { name, phone, relation } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $push: { emergencyContacts: { name, phone, relation } } },
    { new: true, runValidators: true }
  ).select('emergencyContacts');

  res.status(201).json({ success: true, emergencyContacts: user.emergencyContacts });
});

// @desc    Remove a personal emergency contact
// @route   DELETE /api/emergency/contacts/:contactId
// @access  Private
const removeEmergencyContact = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { emergencyContacts: { _id: req.params.contactId } } },
    { new: true }
  ).select('emergencyContacts');

  res.status(200).json({ success: true, emergencyContacts: user.emergencyContacts });
});

// @desc    Find nearby hospitals or pharmacies using Google Places API
// @route   GET /api/emergency/nearby?type=hospital&lat=..&lng=..&radius=..
// @access  Private
const getNearbyPlaces = asyncHandler(async (req, res) => {
  const { type, lat, lng } = req.query;
  const radius = Number(req.query.radius) || 5000; // meters

  if (!['hospital', 'pharmacy'].includes(type)) {
    res.status(400);
    throw new Error('type must be "hospital" or "pharmacy".');
  }
  if (!lat || !lng) {
    res.status(400);
    throw new Error('lat and lng query parameters are required.');
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    res.status(503);
    throw new Error('Nearby places search is not configured on this server.');
  }

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    res.status(502);
    throw new Error(`Google Places API error: ${data.status}`);
  }

  const places = (data.results || []).map((p) => ({
    name: p.name,
    address: p.vicinity,
    location: p.geometry?.location,
    rating: p.rating || null,
    isOpenNow: p.opening_hours?.open_now ?? null,
    placeId: p.place_id,
  }));

  res.status(200).json({ success: true, count: places.length, places });
});

module.exports = {
  createEmergency,
  getEmergencies,
  getEmergency,
  updateLiveLocation,
  respondToEmergency,
  resolveEmergency,
  cancelEmergency,
  getEmergencyContacts,
  addEmergencyContact,
  removeEmergencyContact,
  getNearbyPlaces,
};
