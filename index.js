
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

// 1: INITIALIZATION
const app = express();

// middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
    optionSuccessStatus: 200,
}));
app.use(express.json());

//2:  CONFIGURATIONS

// Firebase Admin 


if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  admin.initializeApp({
    credential: admin.credential.cert(require("./serviceAccountKey.json")),
  });
}

// MongoDB

const PORT = process.env.PORT || 5000;

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/testdb";

app.get("/", (req, res) => {
  res.send("Digital Life Lessons API is running");
});

mongoose
  .connect(mongoUri)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} without DB connection`);
    });
  });












//Stripe



//3: MIDDLEWARE



const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};


const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// 4: MODELS 

// MONGOOSE MODELS
const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  displayName: { type: String },
  photoURL: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isPremium: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

//5: ROUTES 

// Test route
app.get("/api/test-auth", verifyToken, (req, res) => {
  res.json({ message: "You are okay!", user: req.user.email });
});

