✅ FINAL FULL-STACK README

<p align="center">
  <img src="https://raw.githubusercontent.com/mdfardous98/digital-life-lessons-server/main/Banner_readme.png" alt="Digital Life Lessons Banner" />
</p>

<h1 align="center">Digital Life Lessons</h1> <p align="center">A full-stack platform for creating, storing, and sharing meaningful life lessons.</p>

🚀 Live Links
Frontend (Client)
🔗 https://digital-life-lessons-626ff.web.app

📦 GitHub: https://github.com/mdfardous98/digital-life-lessons-client.git

Backend (Server)
🔗 https://digital-life-lessons-server-lilac.vercel.app

📦 GitHub: https://github.com/mdfardous98/digital-life-lessons-server.git

🌐 Overview
Digital Life Lessons is a complete platform that lets users create, share, and learn from life lessons. It includes authentication, premium content, admin tools, analytics, and a modern UI.

✨ Features
🔐 Authentication & Security
Email/password login with Firebase

Google OAuth

Firebase Admin token verification

Protected routes

Role-based access (user, premium, admin)

Password validation rules

📚 Lesson Management
Create lessons with category, title, and emotional tone

Public or private visibility modes

Free or premium access

Upload lesson images

Edit & delete lessons

Search and filter lessons

⭐ Premium Features
One-time payment (৳1500) for lifetime access

Secure Stripe checkout

Premium-only lessons

Premium dashboard

Ad-free environment

🏆 Community Features
Like and save lessons

Comment system

Report inappropriate content

Browse public lessons

Filter by category and tone

📊 Admin Dashboard
User management

Promote user to admin

Delete or review lessons

Manage reports

Platform analytics

🎨 UI/UX Features
Fully responsive

Tailwind CSS styling

Smooth animations

Toast notification system

Modern dashboard layout

Custom 404 page

🛠️ Tech Stack
Frontend
React

React Router

Tailwind CSS

Firebase Authentication

Axios

React Hot Toast

Chart.js

Stripe Checkout

Backend
Node.js

Express

MongoDB + Mongoose

Firebase Admin

Stripe Webhooks

CORS

Helmet

⚙️ Deployment Workflow (Firebase Hosting + Vercel)
This project uses a modern, distributed infrastructure:

Component Technology Deployment Platform Base URL Configuration
Client (Frontend) React/Vite Firebase Hosting Reads VITE_API_URL from its .env and points to the Vercel backend.
Server (Backend) Node/Express Vercel Reads CLIENT_URL from Vercel Environment Variables to set the CORS policy, allowing requests only from the Firebase frontend domain.

Export to Sheets

Steps to Update and Deploy
Code Change: Update the code in either the client or server.

Client Deploy (Frontend): Run npm run build then firebase deploy in the client directory.

Server Deploy (Backend): Push code changes to the linked Git repo (e.g., git push origin main) to trigger an automatic deployment on Vercel.

🔧 Installation Guide
Clone the repos
Frontend
Bash

git clone https://github.com/mdfardous98/digital-life-lessons-client.git
cd digital-life-lessons-client
npm install
npm run dev
Backend
Bash

git clone https://github.com/mdfardous98/digital-life-lessons-server.git
cd digital-life-lessons-server
npm install
npm start

🔑 Environment Variables
Frontend (.env in client directory)

VITE_apiKey=your_firebase_key
VITE_authDomain=...
VITE_projectId=...
VITE_stripe_pk=...
VITE_server_url=https://digital-life-lessons-server-lilac.vercel.app
Backend (.env in server directory, and set as Vercel Environment Variables)

MONGODB_URI=your_mongo
STRIPE_SECRET_KEY=your_stripe_secret
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
CLIENT_URL=https://digital-life-lessons-626ff.web.app

📡 API Overview
Endpoint Method Description
/auth/verify POST Verifies user's Firebase token.
/auth/user-role GET Retrieves the user's assigned role.
/lessons POST Creates a new lesson.
/lessons/public GET Retrieves public lessons.
/lessons/:id GET Retrieves a single lesson by ID.
/lessons/:id PATCH Updates a specific lesson.
/lessons/:id DELETE Deletes a specific lesson.
/payment/create-session POST Initiates a Stripe checkout session.
/payment/webhook POST Stripe webhook listener for payment status updates.
/admin/users GET Lists all users (Admin only).
/admin/promote/:id PATCH Promotes a user to admin role.
/admin/lesson/:id DELETE Deletes a lesson (Admin only).

📈 Future Enhancements
AI lesson suggestions

Advanced lesson tagging

Social sharing

Mobile app version

🤝 Contribution
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

📄 License
MIT License

👤 Author
MD Fardous

📧 Email: mdjfardous@gmail.com
