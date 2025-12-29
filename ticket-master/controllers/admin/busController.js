import Bus from '../../models/operator/busModel.js';
import transporter from '../../config/nodemailer.js';

export const getBuses = async (req, res) => {
    try {
        // If no search parameter is provided, the query will be empty and return all buses.
        const { search } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { busName: { $regex: search, $options: 'i' } },
                { busNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const buses = await Bus.find(query); // Returns all bus details
        res.json(buses);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
};

// Update Bus Status & Send Verification Email if applicable
export const updateBusStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;
    
    // Find the bus and populate the createdBy field
    const bus = await Bus.findById(id).populate('createdBy');
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }
    
    // Store previous verified status
    const wasVerified = bus.verified;
    
    // Update bus verified status
    bus.verified = verified;
    const updatedBus = await bus.save();
    
    // Send verification email only if the status changed from unverified to verified
    if (!wasVerified && verified && bus.createdBy && bus.createdBy.email) {
      const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: bus.createdBy.email,
        subject: 'Your Bus Has Been Verified - ticket master',
        text: `Hello ${bus.createdBy.name},\n\nYour bus "${bus.busName}" has been successfully verified by our administration team. You can now manage your bus services through your dashboard.\n\nBest regards,\nticket master Team`
      };
      transporter.sendMail(mailOptions).catch(error => {
        console.error("Email sending error:", error);
      });
    }
    
    res.json({
      success: true,
      message: 'Bus verification status updated successfully',
      bus: updatedBus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// Delete Bus & respond accordingly
export const deleteBus = async (req, res) => {
    try {
      const { id } = req.params;
      const deletedBus = await Bus.findByIdAndDelete(id);
      if (!deletedBus) {
        return res.status(404).json({ success: false, message: 'Bus not found' });
      }
      res.json({ success: true, message: 'Bus deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
  };
  