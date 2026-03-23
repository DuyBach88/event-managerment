const express = require("express");
const eventRouter = express.Router();
const jwt = require("jsonwebtoken");
const secretKey = process.env.JWT_SECRET_KEY;
let path = require("path");
var moment = require("moment");
// Get the models to Connect DB
let mongoose = require("mongoose");
require("./../Models/eventModel");
require("./../Models/notificationModel");
let eventModel = mongoose.model("event");
// Speaker Model
require("./../Models/speakerModel");
let speakerModel = mongoose.model("speaker");

let notificationModel = mongoose.model("notification");

const authenticate = (req, res, next) => {
  try {
    const token = req.cookies?.authToken;
    if (!token) {
      return res.redirect("/login");
    }

    const decoded = jwt.verify(token, secretKey);
    if (decoded.role !== "admin" && decoded.role !== "speaker") {
      return res.redirect("/login");
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.redirect("/login");
  }
};

// Apply authentication
eventRouter.use(authenticate);

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.redirect("/login");
  }
  next();
};

// Admin routes
eventRouter.get("/add", authenticate, (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/login");
  }

  speakerModel
    .find({})
    .then((speakers) => {
      res.render("Events/addEvent", { mySpeakers: speakers });
    })
    .catch((err) => {
      console.log(err);
    });
});

eventRouter.get("/update/:_id", authenticate, async (req, res) => {
  try {
    const event = await eventModel
      .findById(req.params._id)
      .populate("mainSpeaker")
      .populate("otherSpeaker");

    if (!event) {
      console.log("Event not found:", req.params._id);
      return res.redirect("/event/list");
    }

    const speakers = await speakerModel.find({});

    res.render("Events/editEvent", {
      selectedEvent: event,
      mySpeakers: speakers,
      moment: moment,
      error: null,
    });
  } catch (err) {
    console.error("Error in update route:", err);
    res.redirect("/event/list");
  }
});

eventRouter.get("/list", authenticate, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Changed from 10 to 5
    const skip = (page - 1) * limit;

    const totalEvents = await eventModel.countDocuments({});
    const totalPages = Math.ceil(totalEvents / limit);

    const events = await eventModel
      .find({})
      .populate({ path: "mainSpeaker otherSpeaker" })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    res.render("Events/eventsList", {
      events,
      currentPage: page,
      totalPages,
      totalEvents,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error loading events");
  }
});

eventRouter.get("/search", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Changed from 10 to 5
    const skip = (page - 1) * limit;
    const { query, type } = req.query;
    let searchQuery = {};

    if (query && type) {
      switch (type) {
        case "title":
          searchQuery.title = new RegExp(query, "i");
          break;
        case "location":
          searchQuery.location = new RegExp(query, "i");
          break;
        case "speaker":
          const speakers = await speakerModel.find({
            fullName: new RegExp(query, "i"),
          });
          const speakerIds = speakers.map((s) => s._id);
          searchQuery.$or = [
            { mainSpeaker: { $in: speakerIds } },
            { otherSpeaker: { $in: speakerIds } },
          ];
          break;
        case "date":
          const searchDate = new Date(query);
          searchDate.setHours(0, 0, 0, 0);
          const endDate = new Date(searchDate);
          endDate.setHours(23, 59, 59, 999);
          searchQuery.date = {
            $gte: searchDate,
            $lte: endDate,
          };
          break;
      }
    }

    const totalEvents = await eventModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalEvents / limit);

    const events = await eventModel
      .find(searchQuery)
      .populate("mainSpeaker otherSpeaker")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      events: events,
      currentPage: page,
      totalPages: totalPages,
      totalEvents: totalEvents,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Error searching events" });
  }
});

eventRouter.post("/add", adminOnly, (req, res) => {
  let myNewEvent = new eventModel(req.body);
  myNewEvent
    .save()
    .then((data) => {
      res.redirect("/event/list");
    })
    .catch((err) => {
      console.log(err);
    });
});

eventRouter.post("/update", adminOnly, async (req, res) => {
  try {
    console.log("Update request body:", req.body); // Debug log

    // Validate required fields
    if (!req.body.title || !req.body.date || !req.body.location) {
      throw new Error("Missing required fields");
    }

    // Format the data
    const eventData = {
      title: req.body.title.trim(),
      date: new Date(req.body.date),
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      location: req.body.location.trim(),
      mainSpeaker: req.body.mainSpeaker || null,
      otherSpeaker: req.body.otherSpeaker
        ? Array.isArray(req.body.otherSpeaker)
          ? req.body.otherSpeaker.filter(
              (id) => id && id !== "null" && id !== "undefined"
            )
          : [req.body.otherSpeaker].filter(
              (id) => id && id !== "null" && id !== "undefined"
            )
        : [],
    };

    console.log("Formatted event data:", eventData); // Debug log

    const updatedEvent = await eventModel.findByIdAndUpdate(
      req.body._id,
      eventData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedEvent) {
      throw new Error("Event not found");
    }

    console.log("Event updated successfully:", updatedEvent); // Debug log
    return res.redirect("/event/list");
  } catch (err) {
    console.error("Detailed update error:", err);

    // Get speakers for re-rendering the form
    const speakers = await speakerModel.find({});

    // Preserve the form data in case of error
    const formData = {
      _id: req.body._id,
      title: req.body.title,
      date: req.body.date,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      location: req.body.location,
      mainSpeaker: req.body.mainSpeaker,
      otherSpeaker: req.body.otherSpeaker || [],
    };

    return res.status(500).render("Events/editEvent", {
      selectedEvent: formData,
      mySpeakers: speakers,
      moment: moment,
      error: err.message || "Error updating event",
    });
  }
});

eventRouter.post("/delete", adminOnly, async (req, res) => {
  try {
    // First delete all notifications related to this event
    await notificationModel.deleteMany({ eventId: req.body.eventId });

    // Then delete the event
    const deletedEvent = await eventModel.findByIdAndDelete(req.body.eventId);

    if (!deletedEvent) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Event and related notifications deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({
      success: false,
      message: "Error deleting event",
    });
  }
});

// Speaker routes
eventRouter.post("/cancel", async (req, res) => {
  try {
    const { eventId, speakerId } = req.body;

    // Create notification with just the references
    const notification = new notificationModel({
      eventId: eventId,
      speakerId: speakerId,
      date: new Date(),
    });

    // Remove the speaker from the event
    await eventModel.updateOne(
      { _id: eventId },
      { $unset: { mainSpeaker: "" } }
    );

    await notification.save();
    res.send(speakerId);
  } catch (err) {
    console.error("Error in cancel route:", err);
    res.status(500).send("Error updating event");
  }
});

eventRouter.get("/canceled", authenticate, async (req, res) => {
  try {
    const notifications = await notificationModel
      .find({})
      .populate("eventId")
      .sort({ date: -1 })
      .lean();

    // Group by events and format data
    const eventMap = new Map();
    notifications.forEach((notification) => {
      if (!notification.eventId) return;

      if (!eventMap.has(notification.eventId._id.toString())) {
        eventMap.set(notification.eventId._id.toString(), {
          _id: notification.eventId._id,
          title: notification.eventId.title,
          date: notification.eventId.date,
          startTime: notification.eventId.startTime,
          endTime: notification.eventId.endTime,
          location: notification.eventId.location,
        });
      }
    });

    const canceledEvents = Array.from(eventMap.values());

    // Render the basic view instead of the detailed admin view
    res.render("Events/eventCanceled", {
      canceledEvents: canceledEvents,
    });
  } catch (err) {
    console.error("Error loading canceled events:", err);
    res.status(500).send("Error loading canceled events");
  }
});

module.exports = eventRouter;
