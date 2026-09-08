const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// Protect routes - verifies access token
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized. Please log in.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error('Access token expired. Please refresh your session.');
    }
    res.status(401);
    throw new Error('Not authorized. Invalid token.');
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    res.status(401);
    throw new Error('User belonging to this token no longer exists.');
  }

  if (!user.isActive || user.isBanned) {
    res.status(403);
    throw new Error('This account has been deactivated or banned.');
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    res.status(401);
    throw new Error('Password was recently changed. Please log in again.');
  }

  req.user = user;
  next();
});

// Restrict route to specific roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error('You do not have permission to perform this action.');
    }
    next();
  };
};

// Optional auth - attaches user if token present, but doesn't fail if absent
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive && !user.isBanned) {
      req.user = user;
    }
  } catch (err) {
    // Silently ignore invalid tokens for optional auth
  }

  next();
});

module.exports = { protect, restrictTo, optionalAuth };
