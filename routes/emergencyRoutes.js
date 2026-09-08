const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();

const {
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
} = require('../controllers/emergencyController');

const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const EMERGENCY_TYPES = ['sos', 'medical', 'blood_requirement', 'fire', 'security', 'accident', 'other'];

router.use(protect);

router.get(
  '/nearby',
  [
    query('type').isIn(['hospital', 'pharmacy']).withMessage('type must be hospital or pharmacy'),
    query('lat').isFloat().withMessage('Valid lat is required'),
    query('lng').isFloat().withMessage('Valid lng is required'),
  ],
  validate,
  getNearbyPlaces
);

router.get('/contacts', getEmergencyContacts);
router.post(
  '/contacts',
  [
    body('name').trim().notEmpty().withMessage('Contact name is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian phone number required'),
  ],
  validate,
  addEmergencyContact
);
router.delete('/contacts/:contactId', removeEmergencyContact);

router.get('/', getEmergencies);
router.post(
  '/',
  [
    body('type').isIn(EMERGENCY_TYPES).withMessage('Invalid emergency type'),
    body('location.coordinates')
      .isArray({ min: 2, max: 2 })
      .withMessage('location.coordinates must be [longitude, latitude]'),
    body('contactPhone')
      .optional()
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Valid 10-digit Indian phone number required'),
  ],
  validate,
  createEmergency
);

router.get('/:id', getEmergency);
router.post(
  '/:id/location',
  [body('coordinates').isArray({ min: 2, max: 2 }).withMessage('coordinates must be [longitude, latitude]')],
  validate,
  updateLiveLocation
);
router.post('/:id/respond', respondToEmergency);
router.patch('/:id/resolve', resolveEmergency);
router.patch('/:id/cancel', cancelEmergency);

module.exports = router;
