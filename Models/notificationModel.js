const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "event",
  },
  speakerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "speaker",
  },
  type: {
    type: String,
    default: "main_speaker_cancel",
  },
  date: {
    type: Date,
    default: Date.now,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
});

mongoose.model("notification", notificationSchema);
