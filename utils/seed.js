/**
 * Creates (or promotes) the first ConnectHub admin account.
 *
 * Usage:
 *   node utils/seed.js
 *
 * Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD from environment
 * variables if present, otherwise falls back to sensible dev defaults below.
 * If a user with the given email already exists, it is promoted to the
 * 'admin' role instead of creating a duplicate account.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const ADMIN_NAME = process.env.ADMIN_NAME || 'ConnectHub Admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@connecthub.app';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '9999999999';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';

const run = async () => {
  await connectDB();

  let admin = await User.findOne({ email: ADMIN_EMAIL });

  if (admin) {
    admin.role = 'admin';
    admin.isActive = true;
    admin.isBanned = false;
    await admin.save({ validateBeforeSave: false });
    console.log(`Existing user ${ADMIN_EMAIL} promoted to admin.`);
  } else {
    admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      phone: ADMIN_PHONE,
      password: ADMIN_PASSWORD,
      role: 'admin',
      isEmailVerified: true,
    });
    console.log(`Admin account created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log('IMPORTANT: log in and change this password immediately in a real deployment.');
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed script failed:', err.message);
  process.exit(1);
});
