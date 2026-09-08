const asyncHandler = require('express-async-handler');
const Business = require('../models/Business');
const User = require('../models/User');
const ApiFeatures = require('../utils/apiFeatures');
const { deleteFromCloudinary, extractPublicId } = require('../config/cloudinary');

// @desc    Create a new business listing
// @route   POST /api/businesses
// @access  Private
const createBusiness = asyncHandler(async (req, res) => {
  const {
    businessName,
    description,
    category,
    address,
    location,
    phone,
    whatsapp,
    openingHours,
    priceRange,
    society,
  } = req.body;

  const gallery = (req.files || []).map((f) => ({
    url: f.path,
    publicId: f.filename || extractPublicId(f.path),
  }));

  const business = await Business.create({
    businessName,
    description,
    category,
    address,
    location: location?.coordinates ? location : undefined,
    phone,
    whatsapp,
    openingHours,
    priceRange,
    society: society || req.user.society || null,
    gallery,
    owner: req.user._id,
  });

  // Promote the user to business_owner role if they were a plain resident
  if (req.user.role === 'resident') {
    await User.findByIdAndUpdate(req.user._id, { role: 'business_owner' });
  }

  res.status(201).json({ success: true, business });
});

// @desc    Get all businesses (search/filter/sort/paginate, optional geo-near)
// @route   GET /api/businesses
// @access  Public
const getBusinesses = asyncHandler(async (req, res) => {
  const baseFilter = { isActive: true };
  if (req.query.society) baseFilter.society = req.query.society;
  if (req.query.city) baseFilter['address.city'] = new RegExp(req.query.city, 'i');
  if (req.query.priceRange) baseFilter.priceRange = req.query.priceRange;

  // Geo-search: ?lat=..&lng=..&radius=.. (radius in km)
  if (req.query.lat && req.query.lng) {
    const radiusKm = Number(req.query.radius) || 5;
    baseFilter.location = {
      $geoWithin: {
        $centerSphere: [[Number(req.query.lng), Number(req.query.lat)], radiusKm / 6378.1],
      },
    };
  }

  const features = new ApiFeatures(Business.find(baseFilter), req.query)
    .search(['businessName', 'description'])
    .filter(['category'])
    .sort('-ratingsAverage')
    .paginate();

  const businesses = await features.query.populate('owner', 'name profilePhoto');
  const meta = await features.getMeta(Business, baseFilter);

  res.status(200).json({ success: true, count: businesses.length, meta, businesses });
});

// @desc    Get single business
// @route   GET /api/businesses/:id
// @access  Public
const getBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findByIdAndUpdate(
    req.params.id,
    { $inc: { viewCount: 1 } },
    { new: true }
  ).populate('owner', 'name profilePhoto phone');

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  res.status(200).json({ success: true, business });
});

// @desc    Update business listing
// @route   PATCH /api/businesses/:id
// @access  Private (owner only)
const updateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  if (business.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to update this business.');
  }

  const allowedFields = [
    'businessName',
    'description',
    'category',
    'address',
    'location',
    'phone',
    'whatsapp',
    'openingHours',
    'priceRange',
    'isActive',
  ];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) business[field] = req.body[field];
  });

  if (req.files && req.files.length) {
    const newImages = req.files.map((f) => ({ url: f.path, publicId: f.filename || extractPublicId(f.path) }));
    business.gallery.push(...newImages);
  }

  await business.save();
  res.status(200).json({ success: true, business });
});

// @desc    Delete a gallery image from a business
// @route   DELETE /api/businesses/:id/gallery/:publicId
// @access  Private (owner only)
const deleteGalleryImage = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  if (business.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to modify this business.');
  }

  const publicId = decodeURIComponent(req.params.publicId);
  await deleteFromCloudinary(publicId);
  business.gallery = business.gallery.filter((img) => img.publicId !== publicId);
  await business.save();

  res.status(200).json({ success: true, gallery: business.gallery });
});

// @desc    Delete business listing
// @route   DELETE /api/businesses/:id
// @access  Private (owner only)
const deleteBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  if (business.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to delete this business.');
  }

  await Promise.all((business.gallery || []).map((img) => deleteFromCloudinary(img.publicId)));
  await Business.findByIdAndDelete(req.params.id);
  await User.updateMany({ bookmarkedBusinesses: business._id }, { $pull: { bookmarkedBusinesses: business._id } });

  res.status(200).json({ success: true, message: 'Business deleted successfully.' });
});

// @desc    Bookmark / unbookmark a business (toggle)
// @route   POST /api/businesses/:id/bookmark
// @access  Private
const toggleBookmark = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) {
    res.status(404);
    throw new Error('Business not found.');
  }

  const user = await User.findById(req.user._id);
  const isBookmarked = user.bookmarkedBusinesses.some((b) => b.toString() === business._id.toString());

  if (isBookmarked) {
    user.bookmarkedBusinesses = user.bookmarkedBusinesses.filter(
      (b) => b.toString() !== business._id.toString()
    );
  } else {
    user.bookmarkedBusinesses.push(business._id);
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, bookmarked: !isBookmarked });
});

// @desc    Get categories list with counts (for filter UI)
// @route   GET /api/businesses/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Business.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    success: true,
    categories: categories.map((c) => ({ category: c._id, count: c.count })),
  });
});

module.exports = {
  createBusiness,
  getBusinesses,
  getBusiness,
  updateBusiness,
  deleteGalleryImage,
  deleteBusiness,
  toggleBookmark,
  getCategories,
};
