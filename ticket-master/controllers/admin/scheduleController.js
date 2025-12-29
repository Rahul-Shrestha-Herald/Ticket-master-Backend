import Schedule from '../../models/operator/busScheduleModel.js';

// Get all schedules (with populated bus, route, and operator data)
export const getSchedules = async (req, res) => {
  try {
    const schedules = await Schedule.find({})
      .populate('bus')
      .populate('route')
      .populate('operator');
    res.json(schedules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// Delete a schedule by ID
export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSchedule = await Schedule.findByIdAndDelete(id);
    if (!deletedSchedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};
