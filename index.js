require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");
const admin = require("firebase-admin");
// const bodyParser = require("body-parser");

//  init
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
//  regular JSON routes
app.use(express.json());
// For Stripe webhook route  use raw body on that route

//   serviceaccount.json file
try {
  const serviceAccount = require("./serviceaccount.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error("❌ Failed to load or initialize Firebase:", err.message);
  process.exit(1);
}

//  Mongoose models
const { Schema } = mongoose;

/* User */
const userSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: "" },
    photoURL: { type: String, default: "" },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    isPremium: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

/* Lesson */
const lessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    fullDescription: { type: String },
    category: { type: String, required: true, index: true },
    emotionalTone: { type: String, required: true, index: true },
    image: { type: String, default: "" },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true,
    },
    accessLevel: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorUid: { type: String, required: true, index: true },
    likes: [{ type: String }],
    likesCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Lesson = mongoose.model("Lesson", lessonSchema);

/* Comment */
const commentSchema = new Schema({
  lessonId: {
    type: Schema.Types.ObjectId,
    ref: "Lesson",
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  commentText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Comment = mongoose.model("Comment", commentSchema);

/* Favorite */
const favoriteSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);
favoriteSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
const Favorite = mongoose.model("Favorite", favoriteSchema);

/* Report */
const reportSchema = new Schema(
  {
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
      index: true,
    },
    reporterId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterEmail: { type: String, required: true },
    reason: { type: String, required: true },
    message: { type: String, default: "" },
  },
  { timestamps: true }
);
const Report = mongoose.model("Report", reportSchema);

// Middleware: verifyToken (Firebase Admin)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.header("x-auth-token");
  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }
  //  token
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    let dbUser = await User.findOne({ uid: decoded.uid });
    if (!dbUser) {
      // create basic user record using Firebase
      dbUser = new User({
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@noemail.local`,
        displayName:
          decoded.name ||
          (decoded.email ? decoded.email.split("@")[0] : "User"),
        photoURL: decoded.picture || "",
      });
      await dbUser.save();
    }

    //  useful info to req.user
    req.user = {
      uid: dbUser.uid,
      _id: dbUser._id,
      email: dbUser.email,
      isPremium: dbUser.isPremium,
      role: dbUser.role,
    };

    next();
  } catch (err) {
    console.error("verifyToken error:", err?.message || err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// optionalAuth for public endpoints
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.header("x-auth-token");
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const dbUser = await User.findOne({ uid: decoded.uid });
      if (dbUser) {
        req.user = {
          uid: dbUser.uid,
          _id: dbUser._id,
          email: dbUser.email,
          isPremium: dbUser.isPremium,
          role: dbUser.role,
        };
      }
    } catch (err) {}
  }
  next();
};

// admin guard
const verifyAdmin = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Auth required" });
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};

// ----- Routes -----
// Health
app.get("/health", (req, res) => res.json({ status: "✅ Server running" }));

// Auth sync/register endpoint - frontend calls this after Firebase login to sync DB
app.post("/api/auth/sync", async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.body;
    if (!uid || !email)
      return res.status(400).json({ message: "Missing user data" });

    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, email, displayName, photoURL });
      await user.save();
    } else {
      // update small fields
      user.displayName = displayName || user.displayName;
      user.photoURL = photoURL || user.photoURL;
      user.email = email || user.email;
      await user.save();
    }

    res.json({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isPremium: user.isPremium,
      role: user.role,
    });
  } catch (err) {
    console.error("auth/sync error:", err);
    res.status(500).json({ message: "Sync failed" });
  }
});

// Register endpoint
app.post("/api/auth/register", verifyToken, async (req, res) => {
  try {
    const { uid, email } = req.user;
    const displayName =
      req.body.displayName || req.user.displayName || email.split("@")[0];
    const photoURL =
      req.body.photoURL ||
      req.user.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        displayName
      )}&background=6366f1&color=fff`;

    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, email, displayName, photoURL });
      await user.save();
    }
    res.json({
      _id: user._id,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      isPremium: user.isPremium,
    });
  } catch (err) {
    console.error("auth/register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get current user
app.get("/api/users/me", verifyToken, async (req, res) => {
  try {
    const dbUser = await User.findOne({ uid: req.user.uid });
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    res.json({
      uid: dbUser.uid,
      email: dbUser.email,
      displayName: dbUser.displayName,
      photoURL: dbUser.photoURL,
      isPremium: dbUser.isPremium,
      role: dbUser.role,
    });
  } catch (err) {
    console.error("Get user/me error:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// Create lesson
app.post("/api/lessons", verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      emotionalTone,
      image,
      visibility = "private",
      accessLevel = "free",
    } = req.body;
    if (!title || !description || !category || !emotionalTone) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    // user exists
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    // free users can't create premium lessons
    if (accessLevel === "premium" && !user.isPremium) {
      return res
        .status(403)
        .json({ message: "Upgrade to Premium to create premium lessons" });
    }

    const lesson = new Lesson({
      title,
      description,
      fullDescription: description,
      category,
      emotionalTone,
      image: image || null,
      visibility,
      accessLevel,
      author: user._id,
      authorUid: user.uid,
    });

    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    console.error("Create lesson error:", err);
    res.status(500).json({ message: "Failed to create lesson" });
  }
});

// Update lesson (owner only)
app.put("/api/lessons/:id", verifyToken, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    if (lesson.authorUid !== req.user.uid) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // prevent non-premium from setting premium access
    if (req.body.accessLevel === "premium") {
      const dbUser = await User.findOne({ uid: req.user.uid });
      if (!dbUser || !dbUser.isPremium) {
        return res
          .status(403)
          .json({ message: "Upgrade to Premium to set premium access" });
      }
    }

    Object.assign(lesson, req.body, { updatedAt: Date.now() });
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    console.error("Update lesson error:", err);
    res.status(500).json({ message: "Failed to update lesson" });
  }
});

// Delete lesson (owner only or admin)
app.delete("/api/lessons/:id", verifyToken, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    const dbUser = await User.findOne({ uid: req.user.uid });
    if (lesson.authorUid !== req.user.uid && dbUser.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Lesson.findByIdAndDelete(req.params.id);
    // remove related reports, favorites, comments optionally
    await Report.deleteMany({ lessonId: req.params.id });
    await Favorite.deleteMany({ lessonId: req.params.id });
    await Comment.deleteMany({ lessonId: req.params.id });

    res.json({ message: "Lesson deleted" });
  } catch (err) {
    console.error("Delete lesson error:", err);
    res.status(500).json({ message: "Failed to delete lesson" });
  }
});

// Get user's own lessons
app.get("/api/lessons/mine", verifyToken, async (req, res) => {
  try {
    const lessons = await Lesson.find({ authorUid: req.user.uid }).sort({
      createdAt: -1,
    });
    res.json(lessons);
  } catch (err) {
    console.error("Get my lessons error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Public lessons - supports optionalAuth, filtering, search, pagination
app.get("/api/lessons/public", optionalAuth, async (req, res) => {
  try {
    const {
      category,
      tone,
      search,
      page = 1,
      limit = 10,
      sortBy = "newest",
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = { visibility: "public" };
    if (category) query.category = category;
    if (tone) query.emotionalTone = tone;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { fullDescription: { $regex: search, $options: "i" } },
      ];
    }

    // Non-premium users should only see free lessons by default
    if (!req.user || !req.user.isPremium) {
      query.accessLevel = "free";
    }

    let cursor = Lesson.find(query).populate("author", "displayName photoURL");
    // sorting
    if (sortBy === "newest") cursor = cursor.sort({ createdAt: -1 });
    else if (sortBy === "oldest") cursor = cursor.sort({ createdAt: 1 });
    else cursor = cursor.sort({ createdAt: -1 });

    const totalCount = await Lesson.countDocuments(query);
    const lessons = await cursor.skip(skip).limit(Number(limit)).lean();

    // Mask premium lessons for non-premium
    const masked = lessons.map((lesson) => {
      if (
        lesson.accessLevel === "premium" &&
        (!req.user || !req.user.isPremium) &&
        lesson.visibility === "public"
      ) {
        return {
          ...lesson,
          title: "[Premium Content]",
          description: "🔒 This lesson is available to Premium members only.",
          image: null,
          _blurred: true,
        };
      }
      return lesson;
    });

    res.json({
      lessons: masked,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
      },
    });
  } catch (err) {
    console.error("Get public lessons error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get single lesson
app.get("/api/lessons/:id", optionalAuth, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate(
      "author",
      "displayName photoURL"
    );
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    // if private and not owner/admin
    if (lesson.visibility === "private") {
      if (
        !req.user ||
        (lesson.authorUid !== req.user.uid && req.user.role !== "admin")
      ) {
        return res.status(403).json({ message: "This lesson is private" });
      }
    }

    // if premium and requester is not premium and not owner
    if (lesson.accessLevel === "premium") {
      const isOwner = req.user && lesson.authorUid === req.user.uid;
      const isPremiumUser = req.user && req.user.isPremium;
      if (!isOwner && !isPremiumUser) {
        const masked = {
          ...lesson.toObject(),
          description: "[Premium content hidden]",
          image: null,
        };
        return res.json(masked);
      }
    }

    res.json(lesson);
  } catch (err) {
    console.error("Get lesson by id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Comments
app.get("/api/lessons/:id/comments", async (req, res) => {
  try {
    const comments = await Comment.find({ lessonId: req.params.id })
      .populate("userId", "displayName photoURL")
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/lessons/:id/comments", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { commentText } = req.body;
    if (!commentText)
      return res.status(400).json({ message: "Comment text required" });

    const comment = new Comment({
      lessonId: req.params.id,
      userId: user._id,
      commentText,
    });
    await comment.save();
    res.status(201).json(comment);
  } catch (err) {
    console.error("Post comment error:", err);
    res.status(500).json({ message: "Failed to comment" });
  }
});

// Toggle like
app.post("/api/lessons/:id/like", verifyToken, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    const userUid = req.user.uid;
    const idx = lesson.likes.indexOf(userUid);
    if (idx === -1) {
      lesson.likes.push(userUid);
      lesson.likesCount = (lesson.likesCount || 0) + 1;
    } else {
      lesson.likes.splice(idx, 1);
      lesson.likesCount = Math.max(0, (lesson.likesCount || 1) - 1);
    }
    await lesson.save();
    res.json({ likesCount: lesson.likesCount, liked: idx === -1 });
  } catch (err) {
    console.error("Toggle like error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Toggle favorite (separate collection)
app.post("/api/lessons/:id/favorite", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    const lessonId = req.params.id;
    if (!user) return res.status(404).json({ message: "User not found" });

    const existing = await Favorite.findOne({ userId: user._id, lessonId });
    if (existing) {
      await existing.deleteOne();
      return res.json({ favorited: false });
    } else {
      await Favorite.create({ userId: user._id, lessonId });
      return res.json({ favorited: true });
    }
  } catch (err) {
    console.error("Toggle favorite error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's favorites
app.get("/api/favorites", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    const favorites = await Favorite.find({ userId: user._id })
      .populate({
        path: "lessonId",
        populate: { path: "author", select: "displayName photoURL" },
      })
      .sort({ createdAt: -1 });

    res.json(favorites.map((f) => f.lessonId));
  } catch (err) {
    console.error("Get favorites error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Report lesson
app.post("/api/lessons/:id/report", verifyToken, async (req, res) => {
  try {
    const { reason, message } = req.body;
    const validReasons = [
      "Inappropriate Content",
      "Hate Speech or Harassment",
      "Misleading or False Information",
      "Spam or Promotional Content",
      "Sensitive or Disturbing Content",
      "Other",
    ];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ message: "Invalid reason" });
    }
    const user = await User.findOne({ uid: req.user.uid });
    await Report.create({
      lessonId: req.params.id,
      reporterId: user?._id,
      reporterEmail: req.user.email,
      reason,
      message,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Report lesson error:", err);
    res.status(500).json({ message: "Failed to report" });
  }
});

// Admin: get users
app.get("/api/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("Get admin users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: get lessons
app.get("/api/admin/lessons", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const lessons = await Lesson.find()
      .populate("author", "displayName email")
      .sort({ createdAt: -1 });
    res.json(lessons);
  } catch (err) {
    console.error("Get admin lessons error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: get reports
app.get("/api/admin/reports", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("lessonId", "title")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Get admin reports error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: delete lesson and its reports
app.delete(
  "/api/admin/lessons/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      await Lesson.findByIdAndDelete(req.params.id);
      await Report.deleteMany({ lessonId: req.params.id });
      await Favorite.deleteMany({ lessonId: req.params.id });
      await Comment.deleteMany({ lessonId: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error("Admin delete lesson error:", err);
      res.status(500).json({ message: "Failed" });
    }
  }
);

/* ---------- STRIPE ---------- */

app.post("/api/create-checkout-session", verifyToken, async (req, res) => {
  try {
    const dbUser = await User.findOne({ uid: req.user.uid });
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.isPremium)
      return res.status(400).json({ message: "Already premium" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: dbUser.email,
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: "Digital Life Lessons - Lifetime Premium",
              description:
                "One-time payment for lifetime access to all premium lessons",
            },
            unit_amount: 150000, // 1500 tk
          },
          quantity: 1,
        },
      ],
      client_reference_id: dbUser.uid,
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
      metadata: {
        userId: dbUser._id.toString(),
        uid: dbUser.uid,
      },
    });

    res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe create session error:", err);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
});

/**
 * Stripe Webhook
 * - STRIPE_WEBHOOK_SECRET is set
 */
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return res.status(400).send("Missing Stripe signature");
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(
        "Stripe webhook constructEvent error:",
        err?.message || err
      );
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      try {
        //  metadata.client_reference_id or metadata.uid
        const uid = session.client_reference_id || session.metadata?.uid;
        const userId = session.metadata?.userId;
        if (userId) {
          await User.findByIdAndUpdate(
            userId,
            { isPremium: true },
            { new: true }
          );
          console.log(`Webhook: upgraded userId ${userId} to premium`);
        } else if (uid) {
          await User.findOneAndUpdate(
            { uid },
            { isPremium: true },
            { new: true }
          );
          console.log(`Webhook: upgraded uid ${uid} to premium`);
        } else {
          console.warn("Webhook: no userId or uid in session metadata");
        }
      } catch (err) {
        console.error("Webhook processing error:", err);
      }
    }

    res.json({ received: true });
  }
);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Connect DB & start server
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://localhost:27017/digital-life-lessons";

// Simple connection
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Client URL: ${process.env.CLIENT_URL || "not set"}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    // still start server
    app.listen(PORT, () => {
      console.log(`⚠️ Server running on port ${PORT} without DB connection`);
    });
  });
