let mongoose = require("mongoose");
let mongooseSequence = require("mongoose-sequence")(mongoose);

let eventSchema = new mongoose.Schema({
  title: String,
  date: Date,
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  location: String,
  mainSpeaker: { type: mongoose.Schema.Types.ObjectId, ref: "speaker" },
  otherSpeaker: [{ type: mongoose.Schema.Types.ObjectId, ref: "speaker" }],
});

// Apply mongoose-sequence plugin for auto-increment
eventSchema.plugin(mongooseSequence, { inc_field: "eventId" });

mongoose.model("event", eventSchema);
