const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
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
} = require('../controllers/adminController');

const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Every route in this file requires an authenticated admin
router.use(protect, restrictTo('admin'));

// ---------- Dashboard ----------
router.get('/dashboard', getDashboardOverview);

// ---------- Users ----------
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch(
  '/users/:id/ban',
  [body('reason').optional().trim().isLength({ max: 300 })],
  validate,
  banUser
);
router.patch('/users/:id/unban', unbanUser);
router.patch(
  '/users/:id/role',
  [body('role').isIn(['resident', 'business_owner', 'committee_member', 'admin']).withMessage('Invalid role')],
  validate,
  changeUserRole
);
router.delete('/users/:id', deleteUser);

// ---------- Businesses ----------
router.get('/businesses', getBusinessesAdmin);
router.patch('/businesses/:id/verify', verifyBusiness);
router.patch('/businesses/:id/deactivate', deactivateBusiness);

// ---------- Activities ----------
router.get('/activities', getActivitiesAdmin);
router.patch('/activities/:id/cancel', cancelActivityAdmin);
router.delete('/activities/:id', deleteActivityAdmin);

// ---------- Societies ----------
router.get('/societies', getSocietiesAdmin);
router.patch('/societies/:id/verify', verifySociety);

// ---------- Emergencies ----------
router.get('/emergencies', getEmergenciesAdmin);
router.patch('/emergencies/:id/force-resolve', forceResolveEmergency);

// ---------- Analytics ----------
router.get('/analytics/users', getUserAnalytics);
router.get('/analytics/activities', getActivityAnalytics);
router.get('/analytics/businesses', getBusinessAnalytics);
router.get('/analytics/emergencies', getEmergencyAnalytics);
router.get('/analytics/reports', getReportAnalytics);

module.exports = router;
