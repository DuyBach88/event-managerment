require("dotenv").config(); // Load environment variables

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const flash = require("connect-flash");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

// Import Routers
const authenticationRouter = require("./Routers/authenticationRouter");
const speakerRouter = require("./Routers/speakers");
const eventRouter = require("./Routers/events");
const adminRouter = require("./Routers/admin");

// Initialize Express Server
const server = express();
const port = process.env.SERVER_PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}...`);
});

// Database Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB..."))
  .catch((err) => console.error("Database connection error:", err));

// Middleware Configuration
server.locals.moment = require("moment");
server.use(express.static(path.join(__dirname, "public")));
server.use(express.json());
server.use(express.urlencoded({ extended: false }));
server.set("view engine", "ejs");
server.set("views", path.join(__dirname, "views"));

// Logging Middleware
server.use(morgan("dev"));

// Cookie Parser
server.use(cookieParser());

// Session Middleware
server.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }, // 1 ngày
  })
);

// Flash Messages
server.use(flash());

// Routing
// Admin Router
// Speaker Router
// Event Router
// Authentication Router
//...
//...

server.use("/", authenticationRouter);
server.use("/admin", adminRouter);
server.use("/speaker", speakerRouter);
server.use("/event", eventRouter);

// 404 Middleware
server.use((req, res) => {
  res.status(404).send("404 NOT Found");
});

// Error Handling Middleware
server.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!!");
});
