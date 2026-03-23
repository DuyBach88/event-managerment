const express = require("express");
const speakerRouter = express.Router();
let path = require("path");

// TO Get the models to Connect DB
let mongoose = require("mongoose");
require("./../Models/speakerModel");
let speakerModel = mongoose.model("speaker");
require("./../Models/eventModel");
let eventModel = mongoose.model("event");

// Bcrypt and JWT
const jwt = require("jsonwebtoken");
const secretKey = process.env.JWT_SECRET_KEY;
// Flash messages
const flash = require("connect-flash");
const bcrypt = require("bcrypt");
// Middleware để xác thực JWT
const authenticate = (req, res, next) => {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      return res.redirect("/login");
    }

    const decoded = jwt.verify(token, secretKey);

    // Allow both speakers and admin to access
    if (decoded.role !== "speaker" && decoded.role !== "admin") {
      return res.redirect("/login");
    }

    req.user = decoded;
    res.locals.speakerName = decoded.username;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    res.clearCookie("authToken");
    return res.redirect("/login");
  }
};

// Middleware kiểm tra quyền (role)
const checkRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res
        .status(403)
        .json({ message: "You do not have the required permissions" });
    }
    next();
  };
};

// =======================================
speakerRouter.use(authenticate);
speakerRouter.use(flash()); // Cấu hình flash messages

// Speaker Profile Route
speakerRouter.get("/profile", async (request, response) => {
  try {
    const speakerId = request.user.userId;
    const speaker = await speakerModel.findById(speakerId);

    // Get events where speaker is participating
    const events = await eventModel.find({
      $or: [{ mainSpeaker: speakerId }, { otherSpeaker: speakerId }],
    });

    // Check if speaker is a main speaker in any event
    const isMainSpeaker = events.some(
      (event) => event.mainSpeaker && event.mainSpeaker.toString() === speakerId
    );

    // Add notification messages to events
    const eventsWithNotifications = events.map((event) => {
      const eventObj = event.toObject();
      if (event.mainSpeaker && event.mainSpeaker.toString() === speakerId) {
        eventObj.notification = "You are the main speaker for this event";
      } else if (event.otherSpeaker && event.otherSpeaker.includes(speakerId)) {
        eventObj.notification =
          "You are participating as an additional speaker";
      }
      return eventObj;
    });

    response.render("speakerProfile", {
      speakerData: speaker,
      currentEvent: eventsWithNotifications,
      isMainSpeaker: isMainSpeaker,
      successMessage: request.flash("success"),
      passwordSuccess: request.flash("passwordSuccess"),
      passwordError: request.flash("passwordError"),
    });
  } catch (error) {
    console.error("Error in speaker profile:", error);
    response.status(500).send("Error loading profile");
  }
});

// Update Speaker Profile
speakerRouter.post("/updateSpeakerProfile", async (request, response) => {
  try {
    await speakerModel.updateOne(
      { _id: request.user.userId },
      {
        $set: {
          fullName: request.body.fullName,
          username: request.body.username,
          phoneNumber: request.body.phoneNumber,
          gender: request.body.gender,
          "address.city": request.body.city,
          "address.street": request.body.street,
          "address.building": request.body.building,
        },
      }
    );

    request.flash("success", "Profile updated successfully!");
    response.redirect("/speaker/profile");
  } catch (err) {
    console.log(err);
    request.flash("error", "Error updating profile");
    response.redirect("/speaker/profile");
  }
});

// View Upcoming Events with Search and Pagination
speakerRouter.get("/upcomingEvents", async (request, response) => {
  try {
    const speakerId = request.user.userId;
    const page = parseInt(request.query.page) || 1;
    const limit = 5;

    // Get all speakers for filter dropdown
    const allSpeakers = await speakerModel.find({}).select("fullName _id");

    // Initialize search conditions array
    let searchConditions = [];

    // Title and location search
    if (request.query.search) {
      const searchRegex = new RegExp(request.query.search, "i");
      searchConditions.push({
        $or: [{ title: searchRegex }, { location: searchRegex }],
      });
    }

    // Speaker filter
    if (request.query.speakerFilter) {
      const filteredSpeakerId = request.query.speakerFilter;
      searchConditions.push({
        $or: [
          { mainSpeaker: mongoose.Types.ObjectId(filteredSpeakerId) },
          { otherSpeaker: mongoose.Types.ObjectId(filteredSpeakerId) },
        ],
      });
    }

    // Date filter
    if (request.query.date) {
      const searchDate = new Date(request.query.date);
      searchDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(searchDate);
      nextDay.setDate(searchDate.getDate() + 1);
      searchConditions.push({
        date: {
          $gte: searchDate,
          $lt: nextDay,
        },
      });
    }

    // Combine all search conditions
    const searchQuery =
      searchConditions.length > 0 ? { $and: searchConditions } : {};

    // Execute query
    const total = await eventModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(total / limit);

    const events = await eventModel
      .find(searchQuery)
      .populate("mainSpeaker", "fullName")
      .populate("otherSpeaker", "fullName")
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    response.render("Speakers/upcomingEvents", {
      events: events,
      currentSpeakerId: speakerId,
      currentPage: page,
      totalPages: totalPages,
      searchQuery: request.query.search || "",
      searchDate: request.query.date || "",
      allSpeakers: allSpeakers,
      selectedSpeaker: request.query.speakerFilter || "",
    });
  } catch (err) {
    console.error("Error in upcomingEvents route:", err);
    response.status(500).send("Error loading upcoming events");
  }
});

// Change Password API
speakerRouter.post("/changePassword", async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;
    const speakerId = req.user.userId;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      req.flash("error", "Please fill in all fields");
      return res.redirect("/speaker/profile");
    }

    if (newPassword !== confirmNewPassword) {
      req.flash("error", "New passwords do not match");
      return res.redirect("/speaker/profile");
    }

    // Find speaker by ID
    const speaker = await speakerModel.findById(speakerId);
    if (!speaker) {
      req.flash("error", "Speaker not found");
      return res.redirect("/speaker/profile");
    }

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, speaker.password);
    if (!isMatch) {
      req.flash("error", "Old password is incorrect");
      return res.redirect("/speaker/profile");
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in database
    await speakerModel.updateOne(
      { _id: speakerId },
      { password: hashedPassword }
    );

    req.flash("success", "Password changed successfully!");
    return res.redirect("/speaker/profile");
  } catch (error) {
    console.error("Error changing password:", error);
    req.flash("error", "Internal server error");
    return res.redirect("/speaker/profile");
  }
});

// Change Password Page Route
speakerRouter.get("/changePassword", authenticate, (req, res) => {
  try {
    const messages = {
      error: req.flash("error"),
      success: req.flash("success"),
    };
    res.render("Speakers/changePassword", { messages });
  } catch (error) {
    console.error("Error rendering change password page:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Change Password Post Route
speakerRouter.post("/changePassword", authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;
    const speakerId = req.user.userId;

    // Get speaker data
    const speaker = await speakerModel.findById(speakerId);
    if (!speaker) {
      req.flash("error", "Speaker not found");
      return res.redirect("/speaker/changePassword");
    }

    // Verify current password first
    const isValidPassword = await bcrypt.compare(oldPassword, speaker.password);
    if (!isValidPassword) {
      req.flash("error", "Current password is incorrect");
      return res.redirect("/speaker/changePassword");
    }

    // Rest of validation
    if (!newPassword || !confirmNewPassword) {
      req.flash("error", "Please fill in all fields");
      return res.redirect("/speaker/changePassword");
    }

    if (newPassword !== confirmNewPassword) {
      req.flash("error", "New passwords do not match");
      return res.redirect("/speaker/changePassword");
    }

    if (newPassword.length < 6) {
      req.flash("error", "New password must be at least 6 characters");
      return res.redirect("/speaker/changePassword");
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, speaker.password);
    if (isSamePassword) {
      req.flash(
        "error",
        "New password must be different from current password"
      );
      return res.redirect("/speaker/changePassword");
    }

    // Update password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await speakerModel.findByIdAndUpdate(speakerId, {
      password: hashedNewPassword,
    });

    // Store both success and old error messages
    const errorMessage = req.flash("error");
    req.flash("passwordSuccess", "Password changed successfully"); // Use a different key
    if (errorMessage.length > 0) {
      req.flash("passwordError", errorMessage); // Use a different key
    }
    return res.redirect("/speaker/profile");
  } catch (error) {
    console.error("Change password error:", error);
    req.flash("error", "Failed to change password");
    return res.redirect("/speaker/changePassword");
  }
});

// Admin routes
speakerRouter.post("/cancelEvent", authenticate, async (req, res) => {
  try {
    const { eventId } = req.body;
    const speakerId = req.user.userId;

    const event = await eventModel
      .findById(eventId)
      .populate("mainSpeaker")
      .populate("otherSpeakers");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user is main speaker
    const isMainSpeaker =
      event.mainSpeaker && event.mainSpeaker._id.toString() === speakerId;

    if (!isMainSpeaker) {
      return res.status(403).json({
        success: false,
        message: "Only main speakers can cancel events",
      });
    }

    // Create notification for admin
    const notificationModel = mongoose.model("notification");
    const notification = new notificationModel({
      eventId: event._id,
      speakerId: speakerId,
      type: "main_speaker_cancel",
      date: new Date(),
    });
    await notification.save();

    // Update event
    event.mainSpeaker = null;
    await event.save();

    res.json({
      success: true,
      message: "Event cancelled successfully. Admin will be notified.",
    });
  } catch (error) {
    console.error("Cancel event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel event",
    });
  }
});

speakerRouter.use("/admin/*", checkRole("admin"));

// List All Speakers (Admin Only) with Search and Pagination
speakerRouter.get("/list", async (request, response) => {
  try {
    const page = parseInt(request.query.page) || 1;
    const limit = 5; // Changed from 10 to 5
    const searchQuery = request.query.search || "";

    // Create search filter
    const filter = searchQuery
      ? {
          $or: [
            { fullName: { $regex: searchQuery, $options: "i" } },
            { username: { $regex: searchQuery, $options: "i" } },
            { "address.city": { $regex: searchQuery, $options: "i" } },
            { "address.street": { $regex: searchQuery, $options: "i" } },
            { "address.building": { $regex: searchQuery, $options: "i" } },
          ],
        }
      : {};

    // Get total count for pagination
    const total = await speakerModel.countDocuments(filter);

    // Get paginated and filtered speakers
    const speakers = await speakerModel
      .find(filter)
      .skip((page - 1) * limit)
      .limit(limit);

    response.render("Speakers/speakersList", {
      speakers,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
      searchQuery,
    });
  } catch (err) {
    console.error(err);
    response.status(500).send("Error loading speakers");
  }
});

// Delete Speaker (Admin Only)
speakerRouter.post("/delete", (request, response) => {
  speakerModel
    .findByIdAndDelete(request.body.speakerId)
    .then((data) => {
      response.send(request.body.speakerId + "");
    })
    .catch((err) => {
      console.log(err + "");
    });
});

// Update Speaker (Admin Only)
speakerRouter.get("/update/:id", (request, response) => {
  speakerModel
    .findOne({ _id: request.params.id })
    .then((selectedSpeaker) => {
      response.render("Speakers/editSpeaker", { speaker: selectedSpeaker });
    })
    .catch((err) => {
      console.log(err);
    });
});

speakerRouter.post("/update", (request, response) => {
  speakerModel
    .updateOne(
      { _id: request.body._id },
      {
        $set: {
          fullName: request.body.fullName,
          username: request.body.username,
          email: request.body.email,
          phoneNumber: request.body.phoneNumber,
          gender: request.body.gender,
          "address.city": request.body.city,
          "address.street": request.body.street,
          "address.building": request.body.building,
        },
      }
    )
    .then((data) => {
      response.redirect("/speaker/list");
    })
    .catch((err) => {
      console.log(err);
    });
});

// Add New Speaker (Admin Only)
speakerRouter.get("/add", (request, response) => {
  response.render("Speakers/addSpeaker");
});

speakerRouter.post("/add", async (request, response) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(request.body.password, salt);

    let newSpeaker = new speakerModel({
      fullName: request.body.fullName,
      username: request.body.username,
      password: hashedPassword,
      email: request.body.email,
      phoneNumber: request.body.phoneNumber,
      gender: request.body.gender,
      address: {
        city: request.body.city,
        street: request.body.street,
        building: request.body.building,
      },
    });

    await newSpeaker.save();
    response.redirect("/speaker/list");
  } catch (err) {
    console.error("Error adding speaker:", err);
    response.status(500).send("Error adding speaker");
  }
});

speakerRouter.post("/cancel", async (req, res) => {
  try {
    const { speakerId, eventId, isMainSpeaker } = req.body;

    // Verify the speaker is cancelling their own event
    if (speakerId !== req.user.userId) {
      return res.status(403).send("Unauthorized to cancel this event");
    }

    const event = await eventModel.findById(eventId);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    if (isMainSpeaker) {
      if (event.mainSpeaker.toString() === speakerId) {
        event.mainSpeaker = null;
      } else {
        return res.status(403).send("Not authorized as main speaker");
      }
    } else {
      if (event.otherSpeaker.includes(speakerId)) {
        event.otherSpeaker = event.otherSpeaker.filter(
          (id) => id.toString() !== speakerId
        );
      } else {
        return res.status(403).send("Not authorized as other speaker");
      }
    }

    await event.save();

    // Create notification
    const notification = new notificationModel({
      eventId: eventId,
      speakerId: speakerId,
      type: isMainSpeaker ? "main_speaker_cancel" : "other_speaker_cancel",
      date: new Date(),
    });
    await notification.save();

    res.status(200).send("Event cancelled successfully");
  } catch (error) {
    console.error("Error cancelling event:", error);
    res.status(500).send("Error cancelling event");
  }
});

module.exports = speakerRouter;
