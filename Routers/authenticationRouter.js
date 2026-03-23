const express = require("express");
const authenticationRouter = express.Router();
const path = require("path");
const mongoose = require("mongoose");
require("./../Models/speakerModel");
const speakers = mongoose.model("speaker");
const { check, validationResult } = require("express-validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const secretKey = process.env.JWT_SECRET_KEY;
if (!secretKey) {
  throw new Error("JWT_SECRET_KEY is missing in environment variables.");
}

const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ message: "Token is required" });
  }
  // Forgot Password Route

  const token = authHeader.split(" ")[1];
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = decoded;
    next();
  });
};

authenticationRouter.get("/forgot-password", (req, res) => {
  res.render("Authentication/forgot-password", {
    message: null,
  });
});

authenticationRouter.get("/login", (req, res) => {
  res.render("Authentication/login");
});

authenticationRouter.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    if (username === "bachdnd" && password === "123") {
      const adminToken = jwt.sign(
        { userId: "admin", username: "bachdnd", role: "admin" },
        secretKey,
        { expiresIn: "24h" }
      );
      res.cookie("authToken", adminToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.redirect("/admin/profile");
    }

    const speaker = await speakers.findOne({ username });
    if (!speaker) {
      return res.render("Authentication/login", {
        message: { failedLogin: "Invalid username or password" },
      });
    }

    const isValidPassword = await bcrypt.compare(password, speaker.password);
    if (!isValidPassword) {
      return res.render("Authentication/login", {
        message: { failedLogin: "Invalid username or password" },
      });
    }

    const token = jwt.sign(
      { userId: speaker._id, username: speaker.username, role: "speaker" },
      secretKey,
      { expiresIn: "24h" }
    );

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.redirect("/speaker/profile");
  } catch (err) {
    console.error("Login error:", err);
    return res.render("Authentication/login", {
      message: { failedLogin: "An error occurred during login" },
    });
  }
});

authenticationRouter.get("/register", (req, res) => {
  res.render("Authentication/register");
});

authenticationRouter.post(
  "/register",
  [
    check("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    check("username")
      .isAlphanumeric()
      .isLength({ min: 5 })
      .withMessage("Username must be at least 5 alphanumeric characters"),
    check("email")
      .isEmail()
      .withMessage("Invalid email format")
      .normalizeEmail(),
    check("fullName")
      .isLength({ min: 5 })
      .withMessage("Full name must be at least 5 characters")
      .trim(),
    // Add phone number validation
    check("phoneNumber")
      .matches(/^[0-9]{10,11}$/)
      .withMessage("Phone number must be 10-11 digits")
      .trim(),
    check("gender")
      .isIn(["male", "female", "other"])
      .withMessage("Please select a valid gender"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.render("Authentication/register", {
          errors: errors.array().reduce((acc, err) => {
            acc[err.param] = err.msg;
            return acc;
          }, {}),
          oldInput: req.body,
        });
      }

      // Check if username already exists
      const existingUser = await speakers.findOne({
        username: req.body.username,
      });
      if (existingUser) {
        return res.render("Authentication/register", {
          message: "Username already exists",
        });
      }

      // Check if email already exists
      const existingEmail = await speakers.findOne({ email: req.body.email });
      if (existingEmail) {
        return res.render("Authentication/register", {
          message: "Email already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      let newSpeaker = new speakers({
        fullName: req.body.fullName,
        username: req.body.username,
        password: hashedPassword,
        email: req.body.email,
        phoneNumber: req.body.phoneNumber, // Add phone number
        gender: req.body.gender, // Add gender
        address: {
          city: req.body.city,
          street: req.body.street,
          building: req.body.building,
        },
      });

      await newSpeaker.save();
      res.redirect("/login");
    } catch (error) {
      console.error("Registration error:", error);
      res.render("Authentication/register", {
        errors: { general: "An error occurred during registration" },
        oldInput: req.body,
      });
    }
  }
);

authenticationRouter.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await speakers.findOne({ email });
    if (!user) {
      return res.render("Authentication/forgot-password", {
        message: "No user found with this email address.",
      });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Password Reset Request",
      text: `You requested a password reset. Please click the following link to reset your password: \n\nhttp://${req.headers.host}/reset-password/${resetToken}`,
    };

    await transporter.sendMail(mailOptions);

    res.render("Authentication/forgot-password", {
      message: "An email has been sent to reset your password.",
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.render("Authentication/forgot-password", {
      message: "An error occurred. Please try again.",
    });
  }
});
// Reset Password Route
authenticationRouter.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const user = await speakers.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Ensure the token is not expired
    });

    if (!user) {
      return res.render("Authentication/reset-password", {
        message: "Password reset token is invalid or expired.",
        token: null, // Ensure token is passed even if there's an error
      });
    }

    // If the token is valid, render the reset password page with the token
    res.render("Authentication/reset-password", { token, message: null });
  } catch (err) {
    console.error("Error in reset-password route:", err);
    res.render("Authentication/reset-password", {
      message: "An error occurred. Please try again later.",
      token: null,
    });
  }
});

authenticationRouter.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const user = await speakers.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.render("Authentication/reset-password", {
        message: "Password reset token is invalid or expired.",
        token: null,
      });
    }

    // Hash the new password and save it
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined; // Remove the reset token
    user.resetPasswordExpires = undefined; // Remove the expiration
    await user.save();

    res.render("Authentication/reset-password", {
      message: "Your password has been successfully updated.",
      token: null,
    });
  } catch (err) {
    console.error("Error updating password:", err);
    res.render("Authentication/reset-password", {
      message: "An error occurred. Please try again later.",
      token: null,
    });
  }
});

authenticationRouter.get("/logout", (req, res) => {
  res.clearCookie("authToken");
  res.redirect("/login");
});

module.exports = authenticationRouter;
