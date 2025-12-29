import SupportRequest from '../models/supportRequestModel.js';

// Create a new support request
export const createSupportRequest = async (req, res) => {
    try {
        const { name, email, phone, category, bookingId, message } = req.body;

        // Add userId if user is logged in
        let supportRequestData = { name, email, phone, category, message };

        if (bookingId) {
            supportRequestData.bookingId = bookingId;
        }

        if (req.user) {
            supportRequestData.userId = req.user._id;
        }

        const supportRequest = await SupportRequest.create(supportRequestData);

        res.status(201).json({
            success: true,
            message: 'Support request submitted successfully',
            data: supportRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to submit support request',
            error: error.message
        });
    }
};

// Get all support requests (admin only)
export const getAllSupportRequests = async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = {};

        // Filter by status if provided
        if (status && status !== 'all') {
            query.status = status;
        }

        // Search by name, email, or message
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } }
            ];
        }

        const supportRequests = await SupportRequest.find(query)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: supportRequests.length,
            data: supportRequests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve support requests',
            error: error.message
        });
    }
};

// Get a single support request by ID
export const getSupportRequest = async (req, res) => {
    try {
        const supportRequest = await SupportRequest.findById(req.params.id);

        if (!supportRequest) {
            return res.status(404).json({
                success: false,
                message: 'Support request not found'
            });
        }

        res.status(200).json({
            success: true,
            data: supportRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve support request',
            error: error.message
        });
    }
};

// Update support request status (admin only)
export const updateSupportRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['pending', 'complete'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const supportRequest = await SupportRequest.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );

        if (!supportRequest) {
            return res.status(404).json({
                success: false,
                message: 'Support request not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Support request status updated successfully',
            data: supportRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update support request status',
            error: error.message
        });
    }
};