import Route from '../../models/operator/busRouteModel.js';

// Get routes with optional search by bus name, from, or to.
// When a search parameter is provided, an aggregation is used to join the bus data.
export const getRoutes = async (req, res) => {
  try {
    const { search } = req.query;
    let routes;

    if (search) {
      routes = await Route.aggregate([
        {
          $lookup: {
            from: "buses",
            localField: "bus",
            foreignField: "_id",
            as: "bus"
          }
        },
        { $unwind: "$bus" },
        {
          $match: {
            $or: [
              { from: { $regex: search, $options: 'i' } },
              { to: { $regex: search, $options: 'i' } },
              { "bus.busName": { $regex: search, $options: 'i' } }
            ]
          }
        }
      ]);
    } else {
      routes = await Route.find({}).populate('bus');
    }
    res.json(routes);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};

// Delete a route and respond accordingly
export const deleteRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRoute = await Route.findByIdAndDelete(id);
    if (!deletedRoute) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }
    res.json({ success: true, message: 'Route deleted successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};
