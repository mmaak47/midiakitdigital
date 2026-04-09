'use strict';

/**
 * passenger_app.js — Phusion Passenger entry point
 *
 * cPanel Application Manager must be configured with:
 *   Application Root : <path-to-backend-folder>
 *   Startup File     : passenger_app.js
 *
 * Passenger requires this file to export the Express application via
 * module.exports. It manages the HTTP socket itself, so app.listen()
 * is NOT called from this file.
 */

const app = require('./server');

module.exports = app;
