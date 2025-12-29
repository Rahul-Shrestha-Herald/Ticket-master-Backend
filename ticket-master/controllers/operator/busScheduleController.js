import Schedule from '../../models/operator/busScheduleModel.js';

// Helper: Check if the schedule is upcoming (i.e. at least one date is today or later)
const isUpcoming = (scheduleDates) => {
  const now = new Date();
  return scheduleDates.some(date => new Date(date) >= now);
};

// GET all schedules (optionally filtered by query param "filter": all/upcoming/previous)
export const getSchedules = async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    let schedules = await Schedule.find({ operator: req.operator.id })
      .populate('bus')
      .populate('route');
    if (filter === 'upcoming') {
      schedules = schedules.filter(schedule => isUpcoming(schedule.scheduleDates));
    } else if (filter === 'previous') {
      schedules = schedules.filter(schedule => !isUpcoming(schedule.scheduleDates));
    }
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// GET a schedule by ID
export const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ _id: req.params.id, operator: req.operator.id })
      .populate('bus')
      .populate('route');
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// Add schedule
export const addSchedule = async (req, res) => {
  try {
    const { bus, route, scheduleDates, fromTime, toTime, pickupTimes, dropTimes, seats } = req.body;
    if (!bus || !route) {
      return res.status(400).json({ success: false, message: 'Bus or route is not selected.' });
    }
    if (!scheduleDates) {
      return res.status(400).json({ success: false, message: 'Schedule dates are missing.' });
    }
    if (!fromTime || !toTime) {
      return res.status(400).json({ success: false, message: 'Departure or arrival time is missing.' });
    }
    // Validate seats object (ensure seats.dates exists)
    if (!seats || !seats.dates || Object.keys(seats.dates).length === 0) {
      return res.status(400).json({ success: false, message: 'Seat selection is required.' });
    }
    const dates = Array.isArray(scheduleDates)
      ? scheduleDates.map(d => new Date(d))
      : [new Date(scheduleDates)];
    const newSchedule = new Schedule({
      operator: req.operator.id,
      bus,
      route,
      scheduleDates: dates,
      fromTime,
      toTime,
      pickupTimes,
      dropTimes,
      seats
    });
    await newSchedule.save();
    res.status(201).json({ success: true, message: 'Schedule added successfully', schedule: newSchedule });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// Update schedule
export const updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ _id: req.params.id, operator: req.operator.id });
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }
    const { bus, route, scheduleDates, fromTime, toTime, pickupTimes, dropTimes, seats } = req.body;
    if (bus !== undefined) schedule.bus = bus;
    if (route !== undefined) schedule.route = route;
    if (scheduleDates !== undefined) {
      const dates = Array.isArray(scheduleDates)
        ? scheduleDates.map(d => new Date(d))
        : [new Date(scheduleDates)];
      schedule.scheduleDates = dates;
    }
    if (fromTime !== undefined) schedule.fromTime = fromTime;
    if (toTime !== undefined) schedule.toTime = toTime;
    if (pickupTimes !== undefined) schedule.pickupTimes = pickupTimes;
    if (dropTimes !== undefined) schedule.dropTimes = dropTimes;
    if (seats) {
      schedule.seats = seats;
    }
    const updatedSchedule = await schedule.save();
    res.json({ success: true, message: 'Schedule updated successfully', schedule: updatedSchedule });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// DELETE schedule (only if upcoming)
export const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ _id: req.params.id, operator: req.operator.id });
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }
    if (!isUpcoming(schedule.scheduleDates)) {
      return res.status(400).json({ success: false, message: 'Cannot delete past schedule.' });
    }
    await Schedule.findOneAndDelete({ _id: req.params.id, operator: req.operator.id });
    res.json({ success: true, message: 'Schedule deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};
