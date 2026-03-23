let mongoose = require("mongoose");
let mongooseSequence = require("mongoose-sequence")(mongoose); // Import mongoose-sequence

let speakerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: String,
    phoneNumber: String, // Add phone number field
    gender: String, // Add gender field
    address: {
      city: String,
      street: String,
      building: String,
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true }
);

// Apply mongoose-sequence plugin for auto-increment
speakerSchema.plugin(mongooseSequence, { inc_field: "speakerId" }); // Use `speakerId` as the auto-increment field

mongoose.model("speaker", speakerSchema);
