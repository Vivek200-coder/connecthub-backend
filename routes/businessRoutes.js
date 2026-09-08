const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  createBusiness,
  getBusinesses,
  getBusiness,
  updateBusiness,
  deleteGalleryImage,
  deleteBusiness,
  toggleBookmark,
  getCategories,
} = require('../controllers/businessController');

const { protect, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadBusinessGallery } = require('../config/cloudinary');
const reviewRoutes = require('./reviewRoutes');

const CATEGORIES = [
  'grocery',
  'restaurant',
  'salon_spa',
  'medical_pharmacy',
  'electrician',
  'plumber',
  'carpenter',
  'tutoring',
  'fitness_trainer',
  'cleaning_services',
  'pet_care',
  'tailoring',
  'catering',
  'electronics_repair',
  'automobile',
  'real_estate',
  'other',
];

const businessValidation = [
  body('businessName').trim().isLength({ min: 2, max: 100 }).withMessage('Business name must be 2-100 characters'),
  body('description').trim().isLength({ min: 3, max: 2000 }).withMessage('Description must be 3-2000 characters'),
  body('category').isIn(CATEGORIES).withMessage('Invalid category'),
  body('address.street').trim().notEmpty().withMessage('Street address is required'),
  body('address.city').trim().notEmpty().withMessage('City is required'),
  body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian phone number required'),
];

// Nested review routes: /api/businesses/:businessId/reviews
router.use('/:businessId/reviews', reviewRoutes);

router.get('/categories', getCategories);
router.get('/', optionalAuth, getBusinesses);
router.post('/', protect, uploadBusinessGallery.array('gallery', 8), businessValidation, validate, createBusiness);

router.get('/:id', optionalAuth, getBusiness);
router.patch('/:id', protect, uploadBusinessGallery.array('gallery', 8), updateBusiness);
router.delete('/:id/gallery/:publicId', protect, deleteGalleryImage);
router.delete('/:id', protect, deleteBusiness);

router.post('/:id/bookmark', protect, toggleBookmark);

module.exports = router;
