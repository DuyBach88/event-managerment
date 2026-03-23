const express = require("express");
const mongoose = require("mongoose"); // Add this line
const adminRouter = express.Router();
const jwt = require("jsonwebtoken");
const secretKey = process.env.JWT_SECRET_KEY;

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      return res.redirect("/login");
    }

    const decoded = jwt.verify(token, secretKey);

    // Verify admin role
    if (decoded.role !== "admin") {
      return res.redirect("/login");
    }

    req.user = decoded;
    res.locals.adminName = decoded.username;
    next();
  } catch (err) {
    res.clearCookie("authToken");
    return res.redirect("/login");
  }
};

// Apply admin authentication to all admin routes
adminRouter.use(authenticateAdmin);

// Admin profile route
adminRouter.get("/profile", async (req, res) => {
  try {
    const Event = mongoose.model("event");
    const Speaker = mongoose.model("speaker");
    const Notification = mongoose.model("notification");

    const now = new Date();
    // Get basic statistics
    const totalEvents = await Event.countDocuments();
    const totalSpeakers = await Speaker.countDocuments();
    const totalCanceledEvents = await Notification.countDocuments();

    // Count completed events (events with date < now)
    const completedEvents = await Event.countDocuments({
      date: { $lt: now },
    });

    // Get upcoming events (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const upcomingEvents = await Event.countDocuments({
      date: {
        $gte: new Date(),
        $lte: nextWeek,
      },
    });

    // Get time ranges for different periods
    const getDateRange = (period) => {
      const start = new Date();
      switch (period) {
        case "week":
          start.setDate(start.getDate() - 7);
          break;
        case "month":
          start.setMonth(start.getMonth() - 1);
          break;
        case "quarter":
          start.setMonth(start.getMonth() - 3);
          break;
        case "year":
          start.setFullYear(start.getFullYear() - 1);
          break;
      }
      return start;
    };
    const eventsByDayOfWeek = await Event.aggregate([
      { $group: { _id: { $dayOfWeek: "$date" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Chuyển đổi từ MongoDB `_id: 1-7` về index của mảng `dayLabels`
    const eventsByDayFormatted = Array(7).fill(0);
    eventsByDayOfWeek.forEach((item) => {
      eventsByDayFormatted[item._id - 1] = item.count; // MongoDB: 1=Sunday, 2=Monday, ..., 7=Saturday
    });

    // Get event counts for different time periods
    const weeklyEvents = await Event.countDocuments({
      date: { $gte: getDateRange("week") },
    });

    const monthlyEvents = await Event.countDocuments({
      date: { $gte: getDateRange("month") },
    });

    const quarterlyEvents = await Event.countDocuments({
      date: { $gte: getDateRange("quarter") },
    });

    const yearlyEvents = await Event.countDocuments({
      date: { $gte: getDateRange("year") },
    });

    // Get monthly distribution for chart
    const monthlyDistribution = await Event.aggregate([
      {
        $match: {
          date: { $gte: getDateRange("year") },
        },
      },
      {
        $group: {
          _id: { $month: "$date" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get most active speakers (top 5) - including both main and other speakers
    const mostActiveSpeakers = await Event.aggregate([
      // First, create separate documents for main and other speakers
      {
        $facet: {
          mainSpeakers: [
            {
              $match: { mainSpeaker: { $exists: true, $ne: null } },
            },
            {
              $group: {
                _id: "$mainSpeaker",
                count: { $sum: 1 },
                type: { $first: "main" },
              },
            },
          ],
          otherSpeakers: [
            { $unwind: "$otherSpeaker" },
            {
              $group: {
                _id: "$otherSpeaker",
                count: { $sum: 1 },
                type: { $first: "other" },
              },
            },
          ],
        },
      },
      // Combine both arrays
      {
        $project: {
          allSpeakers: {
            $concatArrays: ["$mainSpeakers", "$otherSpeakers"],
          },
        },
      },
      { $unwind: "$allSpeakers" },
      // Group by speaker to combine their counts from both roles
      {
        $group: {
          _id: "$allSpeakers._id",
          totalCount: { $sum: "$allSpeakers.count" },
          roles: {
            $addToSet: "$allSpeakers.type",
          },
        },
      },
      { $sort: { totalCount: -1 } },
      { $limit: 5 },
      // Lookup speaker details
      {
        $lookup: {
          from: "speakers",
          localField: "_id",
          foreignField: "_id",
          as: "speakerInfo",
        },
      },
      { $unwind: "$speakerInfo" },
      // Format final output
      {
        $project: {
          _id: 1,
          totalCount: 1,
          roles: 1,
          "speakerInfo.fullName": 1,
          "speakerInfo.email": 1,
        },
      },
    ]);

    // Top địa điểm phổ biến
    const topLocations = await Event.aggregate([
      {
        $group: {
          _id: "$location",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.render("adminProfile", {
      adminName: req.user.username,
      stats: {
        totalEvents,
        totalSpeakers,
        totalCanceledEvents,
        completedEvents,
        upcomingEvents,
        weeklyEvents,
        monthlyEvents,
        quarterlyEvents,
        yearlyEvents,
        monthlyDistribution,
        mostActiveSpeakers,
        eventsByDayOfWeek: eventsByDayFormatted,
        topLocations,
      },
    });
  } catch (err) {
    console.error("Error getting admin stats:", err);
    res.status(500).send("Error loading admin statistics");
  }
});
// adminRouter.get("/profile", async (req, res) => {
//   try {
//     const Event = mongoose.model("event");
//     const Speaker = mongoose.model("speaker");
//     const Notification = mongoose.model("notification");

//     const now = new Date();

//     // Lấy số lượng tổng thể
//     const totalEvents = await Event.countDocuments();
//     const totalSpeakers = await Speaker.countDocuments();
//     const totalCanceledEvents = await Notification.distinct("eventId").then(
//       (data) => data.length
//     );

//     // Đếm số sự kiện đã hoàn thành (ngày < hiện tại)
//     const completedEvents = await Event.countDocuments({
//       date: { $lt: now },
//     });

//     // Đếm số sự kiện sắp diễn ra trong 7 ngày tới
//     const nextWeek = new Date();
//     nextWeek.setDate(nextWeek.getDate() + 7);
//     const upcomingEvents = await Event.countDocuments({
//       date: { $gte: now, $lte: nextWeek },
//     });

//     // Lấy mốc thời gian bắt đầu của từng khoảng
//     const getDateRange = (period) => {
//       const start = new Date();
//       switch (period) {
//         case "week":
//           start.setDate(start.getDate() - 7);
//           break;
//         case "month":
//           start.setMonth(start.getMonth() - 1);
//           break;
//         case "quarter":
//           start.setMonth(start.getMonth() - 3);
//           break;
//         case "year":
//           start.setFullYear(start.getFullYear() - 1);
//           break;
//       }
//       return start;
//     };

//     // Lấy số lượng sự kiện theo từng khoảng thời gian
//     const [weeklyEvents, monthlyEvents, quarterlyEvents, yearlyEvents] =
//       await Promise.all([
//         Event.countDocuments({ date: { $gte: getDateRange("week") } }),
//         Event.countDocuments({ date: { $gte: getDateRange("month") } }),
//         Event.countDocuments({ date: { $gte: getDateRange("quarter") } }),
//         Event.countDocuments({ date: { $gte: getDateRange("year") } }),
//       ]);

//     // Lấy dữ liệu phân phối theo tháng để vẽ biểu đồ
//     const monthlyDistribution = await Event.aggregate([
//       { $match: { date: { $gte: getDateRange("year") } } },
//       { $group: { _id: { $month: "$date" }, count: { $sum: 1 } } },
//       { $sort: { _id: 1 } },
//     ]);

//     // Tìm top 5 diễn giả hoạt động nhiều nhất
//     const mostActiveSpeakers = await Event.aggregate([
//       {
//         $facet: {
//           mainSpeakers: [
//             { $match: { mainSpeaker: { $exists: true, $ne: null } } },
//             { $group: { _id: "$mainSpeaker", count: { $sum: 1 } } },
//           ],
//           otherSpeakers: [
//             { $unwind: "$otherSpeaker" },
//             { $group: { _id: "$otherSpeaker", count: { $sum: 1 } } },
//           ],
//         },
//       },
//       {
//         $project: {
//           allSpeakers: { $concatArrays: ["$mainSpeakers", "$otherSpeakers"] },
//         },
//       },
//       { $unwind: "$allSpeakers" },
//       {
//         $group: {
//           _id: "$allSpeakers._id",
//           totalCount: { $sum: "$allSpeakers.count" },
//         },
//       },
//       { $sort: { totalCount: -1 } },
//       { $limit: 5 },
//       {
//         $lookup: {
//           from: "speakers",
//           localField: "_id",
//           foreignField: "_id",
//           as: "speakerInfo",
//         },
//       },
//       { $unwind: "$speakerInfo" },
//       {
//         $project: {
//           _id: 1,
//           totalCount: 1,
//           "speakerInfo.fullName": 1,
//           "speakerInfo.email": 1,
//         },
//       },
//     ]);

//     // Lấy top 5 địa điểm tổ chức sự kiện phổ biến
//     const topLocations = await Event.aggregate([
//       { $group: { _id: "$location", count: { $sum: 1 } } },
//       { $sort: { count: -1 } },
//       { $limit: 5 },
//     ]);

//     // Render trang với dữ liệu thống kê
//     res.render("adminProfile", {
//       adminName: req.user.username,
//       stats: {
//         totalEvents,
//         totalSpeakers,
//         totalCanceledEvents,
//         completedEvents,
//         upcomingEvents,
//         weeklyEvents,
//         monthlyEvents,
//         quarterlyEvents,
//         yearlyEvents,
//         monthlyDistribution,
//         mostActiveSpeakers,
//         topLocations,
//       },
//     });
//   } catch (err) {
//     console.error("Error getting admin stats:", err);
//     res.status(500).send("Error loading admin statistics");
//   }
// });

// Fix event management links in adminProfile.ejs
adminRouter.get("/events", (req, res) => {
  res.redirect("/event/list");
});

adminRouter.get("/events/add", (req, res) => {
  res.redirect("/event/add");
});

// Fix the edit route to match the correct path
adminRouter.get("/event/edit/:id", (req, res) => {
  res.redirect(`/event/update/${req.params.id}`);
});

// Canceled events route
// adminRouter.get("/canceled-events", async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1; // Default to page 1
//     const limit = parseInt(req.query.limit) || 5; // Default to 5 events per page
//     const skip = (page - 1) * limit;

//     // Fetch all notifications related to canceled events
//     const notifications = await mongoose
//       .model("notification")
//       .find({})
//       .populate({
//         path: "eventId",
//         populate: [{ path: "mainSpeaker" }, { path: "otherSpeaker" }],
//       })
//       .populate({
//         path: "speakerId",
//         select: "fullName gender phone email", // Select only necessary fields
//       })
//       .sort({ date: -1 }) // Latest notifications first
//       .lean();

//     const eventMap = new Map();

//     notifications.forEach((notification) => {
//       if (!notification.eventId) return;

//       if (!eventMap.has(notification.eventId._id.toString())) {
//         eventMap.set(notification.eventId._id.toString(), {
//           _id: notification.eventId._id,
//           title: notification.eventId.title,
//           date: notification.eventId.date,
//           startTime: notification.eventId.startTime,
//           endTime: notification.eventId.endTime,
//           location: notification.eventId.location,
//           mainSpeaker: notification.eventId.mainSpeaker,
//           otherSpeakers: notification.eventId.otherSpeaker || [],
//           canceledSpeakers: [],
//         });
//       }

//       const event = eventMap.get(notification.eventId._id.toString());
//       if (notification.speakerId) {
//         event.canceledSpeakers.push({
//           name: notification.speakerId.fullName || "Unknown",
//           gender: notification.speakerId.gender || "Not Provided",
//           phone: notification.speakerId.phone || "No phone number",
//           email: notification.speakerId.email || "No email",
//           date: notification.date,
//         });
//       }
//     });

//     const formattedEvents = Array.from(eventMap.values());

//     // **Apply Pagination on Final Data**
//     const totalEvents = formattedEvents.length;
//     const totalPages = Math.ceil(totalEvents / limit);
//     const paginatedEvents = formattedEvents.slice(skip, skip + limit);

//     res.render("adminCanceledEvents", {
//       canceledEvents: paginatedEvents,
//       currentPage: page,
//       totalPages,
//     });
//   } catch (error) {
//     console.error("Error in canceled-events route:", error);
//     res.status(500).send("Error loading canceled events");
//   }
// });
adminRouter.get("/canceled-events", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 2; // Default to 5 events per page
    const skip = (page - 1) * limit;

    // Search filters
    const searchTitle = req.query.title ? req.query.title.trim() : "";
    const searchLocation = req.query.location ? req.query.location.trim() : "";
    const searchCanceledBy = req.query.canceledBy
      ? req.query.canceledBy.trim()
      : "";
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    let query = {};

    if (startDate && endDate) {
      query["date"] = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query["date"] = { $gte: startDate };
    } else if (endDate) {
      query["date"] = { $lte: endDate };
    }

    // Fetch all notifications related to canceled events
    const notifications = await mongoose
      .model("notification")
      .find({})
      .populate({
        path: "eventId",
        populate: [{ path: "mainSpeaker" }, { path: "otherSpeaker" }],
        match: {
          ...(searchTitle
            ? { title: { $regex: searchTitle, $options: "i" } }
            : {}),
          ...(searchLocation
            ? { location: { $regex: searchLocation, $options: "i" } }
            : {}),
          ...query,
        },
      })
      .populate({
        path: "speakerId",
        select: "fullName gender phone email",
        match: searchCanceledBy
          ? { fullName: { $regex: searchCanceledBy, $options: "i" } }
          : {},
      })
      .sort({ date: -1 })
      .lean();

    const eventMap = new Map();

    notifications.forEach((notification) => {
      if (!notification.eventId) return; // Ignore notifications without valid event data

      if (!eventMap.has(notification.eventId._id.toString())) {
        eventMap.set(notification.eventId._id.toString(), {
          _id: notification.eventId._id,
          title: notification.eventId.title,
          date: notification.eventId.date,
          startTime: notification.eventId.startTime,
          endTime: notification.eventId.endTime,
          location: notification.eventId.location,
          mainSpeaker: notification.eventId.mainSpeaker,
          otherSpeakers: notification.eventId.otherSpeaker || [],
          canceledSpeakers: [],
        });
      }

      const event = eventMap.get(notification.eventId._id.toString());
      if (notification.speakerId) {
        event.canceledSpeakers.push({
          name: notification.speakerId.fullName || "Unknown",
          gender: notification.speakerId.gender || "Not Provided",
          phone: notification.speakerId.phone || "No phone number",
          email: notification.speakerId.email || "No email",
          date: notification.date,
        });
      }
    });

    let filteredEvents = Array.from(eventMap.values());

    // **Apply Pagination**
    const totalEvents = filteredEvents.length;
    const totalPages = Math.ceil(totalEvents / limit);
    const paginatedEvents = filteredEvents.slice(skip, skip + limit);

    res.render("adminCanceledEvents", {
      canceledEvents: paginatedEvents,
      currentPage: page,
      totalPages,
      searchTitle,
      searchLocation,
      searchCanceledBy,
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
    });
  } catch (error) {
    console.error("Error in canceled-events route:", error);
    res.status(500).send("Error loading canceled events");
  }
});

// Add other admin routes as needed
module.exports = adminRouter;
