
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


const verifyAdmin = async (req, res, next) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.user.role = user.role;
    next();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
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


//  MONGOOSE MODEL - Lesson

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: [
      "Personal Growth",
      "Career",
      "Relationships",
      "Mindset",
      "Mistakes Learned",
    ],
    required: true,
  },
  emotionalTone: {
    type: String,
    enum: ["Motivational", "Sad", "Realization", "Gratitude"],
    required: true,
  },
  image: { type: String },
  visibility: { type: String, enum: ["public", "private"], default: "private" },
  accessLevel: { type: String, enum: ["free", "premium"], default: "free" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorUid: { type: String, required: true },
  likes: [{ type: String }], 
  likesCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Lesson = mongoose.model("Lesson", lessonSchema);


//5: ROUTES 

// Test route
app.get("/api/test-auth", verifyToken, (req, res) => {
  res.json({ message: "You are okay!", user: req.user.email });
});

// AUTH ROUTES
// Register- user from Firebase
app.post('/api/auth/register', verifyToken, async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.user;

    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        photoURL: photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=6366f1&color=fff`
      });
      await user.save();
    }

    res.json({
      _id: user._id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      isPremium: user.isPremium
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get current user
app.get('/api/users/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      isPremium: user.isPremium
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



// LESSON ROUTES

app.post("/api/lessons", verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      emotionalTone,
      image,
      visibility,
      accessLevel,
    } = req.body;
    const authorUid = req.user.uid;

    // Check if user is premium for premium lesson
    const user = await User.findOne({ uid: authorUid });
    if (accessLevel === "premium" && !user.isPremium) {
      return res
        .status(403)
        .json({ message: "Upgrade to Premium to create premium lessons" });
    }

    const lesson = new Lesson({
      title,
      description,
      category,
      category,
      emotionalTone,
      image: image || null,
      visibility,
      accessLevel,
      author: user._id,
      authorUid,
    });

    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create lesson" });
  }
});


/* Get all lessons of current user */
app.get('/api/lessons/my', verifyToken, async (req, res) => {
  try {
    const lessons = await Lesson.find({ authorUid: req.user.uid })
      .sort({ createdAt: -1 });
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* Get public lessons  */
app.get('/api/lessons/public', async (req, res) => {
  try {
    const { category, tone, search } = req.query;
    let query = { visibility: 'public' };

    if (category) query.category = category;
    if (tone) query.emotionalTone = tone;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const lessons = await Lesson.find(query)
      .populate('author', 'displayName photoURL')
      .sort({ createdAt: -1 });

    res.json(lessons);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* Update lesson */
app.put('/api/lessons/:id', verifyToken, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    if (lesson.authorUid !== req.user.uid) return res.status(403).json({ message: "Not authorized" });

    const user = await User.findOne({ uid: req.user.uid });
    if (req.body.accessLevel === 'premium' && !user.isPremium) {
      return res.status(403).json({ message: "Premium required" });
    }

    Object.assign(lesson, req.body);
    lesson.updatedAt = Date.now();
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* Delete lesson */
app.delete('/api/lessons/:id', verifyToken, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Not found" });
    if (lesson.authorUid !== req.user.uid) return res.status(403).json({ message: "Not authorized" });

    await lesson.deleteOne();
    res.json({ message: "Lesson deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});