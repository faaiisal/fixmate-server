# FixMate – Backend

## Project Name
**FixMate – Smart Repair Service Platform**

## Purpose
FixMate is a repair service booking platform that connects customers with technicians for repairing smartphones, laptops, air conditioners and other home appliances.

This repository contains the backend REST API built with TypeScript, Express.js and MongoDB.

## Live URL
- Backend API: `YOUR_BACKEND_LIVE_URL`
- Frontend: `YOUR_FRONTEND_LIVE_URL`

## Admin Credentials
- Email: `YOUR_ADMIN_EMAIL`
- Password: `YOUR_ADMIN_PASSWORD`

*Use the actual seeded admin credentials. Do not publish real passwords in a public repository.*

## Key Features
- User authentication and role-based authorization.
- Customer, Technician and Admin management.
- Service creation, updating and approval.
- Repair booking and status management.
- Payment and transaction management.
- MongoDB database integration.
- Protected REST API endpoints.

## Technology Stack
- Node.js
- TypeScript
- Express.js
- MongoDB Native Driver

## Installed Packages

**Main dependencies:**
- `express` – Backend server and API routing.
- `mongodb` – MongoDB database connection.
- `cors` – Cross-origin request handling.
- `dotenv` – Environment variable management.

**Additional development dependencies:** Add the actual packages used in this project, such as TypeScript and its required type definitions.

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
DB_NAME=fixmate
CLIENT_URL=http://localhost:3000
```

Add any additional authentication or payment variables required by your implementation.

## Run Locally

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Start Production Server

```bash
npm start
```

## Database Collections

- `users`
- `services`
- `bookings`
- `payments`

## Author
**Faisal Ahmed**