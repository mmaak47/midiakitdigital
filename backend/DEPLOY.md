# Deployment Guide — Intermidia Mídia Kit (cPanel + Phusion Passenger)

## Overview

This backend is a Node.js/Express application served by **Phusion Passenger** via cPanel's
Node.js Application Manager. No root access, Docker, or system services are required.

---

## 1. Prepare files locally

Before uploading, build the frontend (if applicable) and make sure `node_modules/` is **not**
included in the upload — dependencies are installed on the server.

```
backend/
  server.js          ← application logic
  passenger_app.js   ← Passenger entry point  ← upload this
  package.json
  database.js
  license.js
  backupService.js
  entornoAnalysis.js
  .env               ← create from .env.example (never commit)
  uploads/           ← create this empty folder on the server
```

---

## 2. Upload via FTP

Use FileZilla (or any FTP client) with your cPanel FTP credentials.

| Local path | Remote path (example) |
|---|---|
| `backend/` (contents) | `/home/<cpanel-user>/midiakit/` |

- Upload **all files except** `node_modules/` and `.git/`
- Make sure `.env` (filled from `.env.example`) is uploaded
- Create an empty `uploads/` folder on the server if it does not exist

---

## 3. Install dependencies on the server

Open **cPanel → Terminal** (or SSH if available) and run:

```bash
cd ~/midiakit
npm install --production
```

This installs only production dependencies (no devDependencies).

---

## 4. Register the app in cPanel Node.js Application Manager

1. Log in to cPanel → **Setup Node.js App**
2. Click **Create Application**

| Field | Value |
|---|---|
| Node.js version | 18.x or 20.x (LTS) |
| Application mode | Production |
| Application root | `/home/<cpanel-user>/midiakit` |
| Application URL | `yourdomain.com` (or a subdomain) |
| Application startup file | `passenger_app.js` |

3. Click **Create**

> **Important:** Do **not** set `PORT` in the environment variables panel.
> Passenger injects it automatically via a Unix socket. Setting it manually
> will cause a binding conflict.

---

## 5. Set environment variables

In the cPanel Node.js App panel → **Environment Variables**, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGINS` | `https://yourdomain.com` |
| `LICENSE_URL` | *(your license URL, or leave blank to bypass)* |
| `LICENSE_CLIENT` | *(your client ID, or leave blank to bypass)* |
| `SQLITE_BACKUP_ENABLED` | `true` |

---

## 6. Start / restart the app

Click **Restart** in the Node.js App panel. Check the Passenger log for errors:

```
/home/<cpanel-user>/logs/passenger.log
```

---

## 7. Verify

Visit `https://yourdomain.com/api/pontos` — you should receive a JSON response.

---

## Migrating to a VPS later

When you're ready to move to a VPS (e.g. the existing server at `REDACTED_OLD_VPS_IP`):

1. Copy the project to the VPS:
   ```bash
   scp -r ./backend mmak@REDACTED_OLD_VPS_IP:/home/mmak/midiakit/
   ```
2. On the VPS, install deps and start with PM2:
   ```bash
   cd /home/mmak/midiakit
   npm install --production
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup   # follow the printed command to enable auto-start on reboot
   ```
3. The same `server.js` works under both Passenger and PM2 without any code changes — PM2
   runs `node server.js` directly, while Passenger uses `passenger_app.js`.

---

## File reference

| File | Purpose |
|---|---|
| `server.js` | Main application — works standalone (`node server.js`) or as a module |
| `passenger_app.js` | Passenger entry point — exports the Express app |
| `.env.example` | Template for environment variables |
| `ecosystem.config.js` | PM2 config for VPS deployment |
