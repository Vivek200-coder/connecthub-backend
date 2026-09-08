# ConnectHub Backend

Node.js + Express + MongoDB REST API for ConnectHub — a community platform for Indian housing societies. Covers authentication, societies, activities, business directory + reviews, emergency/SOS, real-time chat (Socket.io), notifications, moderation reports, and an admin panel with analytics.

## Tech Stack
Express 4, Mongoose 8, Socket.io 4, JWT (access + rotating refresh tokens), bcrypt, Cloudinary (images), Firebase Admin (push notifications), Nodemailer (transactional email), express-validator, helmet, express-rate-limit, express-mongo-sanitize, xss-clean.

## 1. Installation

```bash
cd backend
npm install
cp .env.example .env
# then edit .env with your real values (see below)
```

## 2. Required Environment Variables

See `.env.example` for the full list. At minimum for local development you need:

- `MONGO_URI` — a running MongoDB instance (local `mongod` or Atlas connection string)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — any long random strings
- `CLIENT_URL` — used for CORS and for building email links (e.g. `http://localhost:3000`)

Optional but required for specific features:
- `CLOUDINARY_*` — required for any image upload endpoint (profile photo, activity images, business gallery, chat images, group photo)
- `SMTP_*` / `EMAIL_FROM` — required for forgot-password and email-verification emails
- `FIREBASE_*` — required for push notifications; the app runs fine without it, it just skips sending pushes and logs a warning
- `GOOGLE_MAPS_API_KEY` — required for `/api/emergency/nearby` (hospital/pharmacy search)

## 3. Run

```bash
npm run dev     # nodemon, auto-restarts on file changes
npm start        # production
```

The API starts on `http://localhost:5000` (or `PORT` from `.env`). Health check: `GET /api/health`.

## 4. Create Your First Admin Account

```bash
npm run seed
```

Reads `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` from `.env` if present, otherwise creates:
- Email: `admin@connecthub.app`
- Password: `Admin@12345`

**Change this password immediately after first login in any real deployment.** Running the script again on an existing email promotes that user to `admin` instead of duplicating the account.

## 5. Testing Endpoints

A Postman/Insomnia collection isn't included, but every endpoint is documented with example requests in `../API_DOCUMENTATION.md`. Recommended smoke-test order:

1. `POST /api/auth/register` → `POST /api/auth/login` → save `accessToken`
2. `POST /api/societies` → `POST /api/societies/:id/join` (as a second user)
3. `POST /api/activities` → `POST /api/activities/:id/join` → `POST /api/activities/:id/like` → `POST /api/activities/:id/comments`
4. `POST /api/businesses` → `POST /api/businesses/:id/reviews`
5. `POST /api/emergency` (as a society member) → confirm the other member receives a `emergency:new` Socket.io event and a row in `GET /api/notifications`
6. `POST /api/chats/one-to-one` → `POST /api/chats/:chatId/messages` → `GET /api/chats/:chatId/messages`
7. `npm run seed` → log in as admin → `GET /api/admin/dashboard`

## 6. Real-Time (Socket.io)

Connect with:
```js
const socket = io('http://localhost:5000', { auth: { token: accessToken } });
```
See the "Socket.io Real-Time Events" section of `API_DOCUMENTATION.md` for the full event list.

## 7. Project Structure

```
backend/
  config/        Mongo + Cloudinary setup
  controllers/   Route handlers, one file per module
  middleware/    auth (JWT), error handling, express-validator wiring
  models/        Mongoose schemas
  routes/        Express routers, one file per module (some nested, e.g. reviews under businesses)
  utils/         apiFeatures (search/filter/paginate), email, push notifications, Socket.io, seed script
  uploads/       local scratch dir (actual files live in Cloudinary)
  server.js      app entry point
```

## 8. Deployment Guide

This API is stateless aside from the DB, so any standard Node host works (Render, Railway, Fly.io, EC2, DigitalOcean App Platform, etc).

1. Provision a MongoDB instance (Atlas is the easiest managed option) and set `MONGO_URI`.
2. Set `NODE_ENV=production` and all secrets in your host's environment variable panel — never commit `.env`.
3. Set `CLIENT_URL` to your deployed frontend's real origin (tightens CORS and fixes email links).
4. Cloudinary, SMTP, Firebase, and Google Maps credentials should point at production accounts, not dev/test ones.
5. Put the app behind HTTPS (most PaaS hosts do this for you); `helmet()` and the `secure` cookie flag on refresh tokens assume TLS in production.
6. Socket.io needs sticky sessions if you run more than one instance behind a load balancer — either enable sticky sessions on the LB or add the `socket.io-redis` adapter so events fan out across instances.
7. Run `npm run seed` once against production to create the first admin account, then log in and change the password immediately.
8. Set up log aggregation (the app logs via `morgan` + `console.error`) and a process manager (PM2, or your host's built-in restart policy) for crash recovery.

## 9. Security Notes

- Access tokens are short-lived (15 min default); refresh tokens rotate on every use and are stored per-device (max 5), so `logout-all` on password change invalidates every session.
- Rate limiting is stricter on `/api/auth/*` (20 req/15min) than the rest of the API (200 req/15min) to slow down credential stuffing.
- All list/search endpoints cap `limit` at 100 to prevent unbounded queries.
- Passwords are bcrypt-hashed with 12 salt rounds; reset/verification tokens are stored as SHA-256 hashes, never in plaintext.
