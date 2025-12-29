import Route from '../models/operator/busRouteModel.js';
import Schedule from '../models/operator/busScheduleModel.js';

export const searchRoutes = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }
    // Create a regex for case-insensitive partial match
    const regex = new RegExp(query, 'i');
    const routes = await Route.find({
      $or: [
        { from: regex },
        { to: regex },
        { pickupPoints: regex },
        { dropPoints: regex }
      ]
    });
    res.json(routes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBusData = async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const dateParam = req.query.date;

    // Today's date string for comparison
    const todayStr = new Date().toISOString().split("T")[0];
    // If a date is provided, match exactly; otherwise match any date today or later
    const dateFilter = dateParam
      ? { scheduleDateStr: dateParam }
      : { scheduleDateStr: { $gte: todayStr } };

    // Build the aggregation pipeline
    const pipeline = [
      // Unwind the scheduleDates array to have one record per date.
      { $unwind: "$scheduleDates" },
      // Convert each date to a string in YYYY-MM-DD format.
      {
        $addFields: {
          scheduleDateStr: {
            $dateToString: { format: "%Y-%m-%d", date: "$scheduleDates" }
          }
        }
      },
      // Filter by date: either the provided date or any future date (including today)
      { $match: dateFilter },
      // Look up bus details
      {
        $lookup: {
          from: "buses",
          localField: "bus",
          foreignField: "_id",
          as: "bus"
        }
      },
      { $unwind: "$bus" },
      // Look up route details
      {
        $lookup: {
          from: "routes",
          localField: "route",
          foreignField: "_id",
          as: "route"
        }
      },
      { $unwind: "$route" }
    ];

    // If search parameters for route are provided, add additional filtering
    let routeMatch = {};
    if (fromParam) {
      routeMatch.$or = [
        { "route.from": { $regex: fromParam, $options: "i" } },
        { "route.pickupPoints": { $regex: fromParam, $options: "i" } }
      ];
    }
    if (toParam) {
      if (routeMatch.$or) {
        routeMatch.$and = [
          {
            $or: [
              { "route.to": { $regex: toParam, $options: "i" } },
              { "route.dropPoints": { $regex: toParam, $options: "i" } }
            ]
          }
        ];
      } else {
        routeMatch.$or = [
          { "route.to": { $regex: toParam, $options: "i" } },
          { "route.dropPoints": { $regex: toParam, $options: "i" } }
        ];
      }
    }
    if (Object.keys(routeMatch).length > 0) {
      pipeline.push({ $match: routeMatch });
    }

    // Sort, skip, and limit
    pipeline.push({ $sort: { scheduleDateStr: 1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const tickets = await Schedule.aggregate(pipeline);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const searchBus = async (req, res) => {
  try {
    const { from, to, date } = req.query;
    if (!from || !to || !date) {
      return res.status(400).json({ message: "Please provide 'from', 'to', and 'date'" });
    }

    const searchDate = new Date(date);
    // Find schedules that have the given date in scheduleDates
    let schedules = await Schedule.find({
      scheduleDates: { $elemMatch: { $eq: searchDate } }
    }).populate('route').populate('bus');

    const fromRegex = new RegExp(from, 'i');
    const toRegex = new RegExp(to, 'i');

    // Filter schedules based on route information
    schedules = schedules.filter(schedule => {
      const route = schedule.route;
      if (!route) return false;
      const fromMatch = fromRegex.test(route.from) ||
        (Array.isArray(route.pickupPoints) && route.pickupPoints.some(point => fromRegex.test(point)));
      const toMatch = toRegex.test(route.to) ||
        (Array.isArray(route.dropPoints) && route.dropPoints.some(point => toRegex.test(point)));
      return fromMatch && toMatch;
    });

    if (schedules.length === 0) {
      return res.status(404).json({ message: "No buses found" });
    }

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
