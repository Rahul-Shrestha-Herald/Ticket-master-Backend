import Notification from '../models/notificationModel.js';

/** Internal helper — call from other controllers to create a notification */
export const createNotification = async ({ userId, type, title, message, link = null, meta = {} }) => {
    try {
        await Notification.create({ userId, type, title, message, link, meta });
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
};

/** GET /api/user/notifications — get all notifications for logged-in user */
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const unreadCount = notifications.filter(n => !n.isRead).length;

        return res.json({ success: true, notifications, unreadCount });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/** PATCH /api/user/notifications/:id/read — mark one as read */
export const markRead = async (req, res) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { isRead: true }
        );
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/** PATCH /api/user/notifications/read-all — mark all as read */
export const markAllRead = async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.userId, isRead: false }, { isRead: true });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/** DELETE /api/user/notifications/:id — delete one */
export const deleteNotification = async (req, res) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/** DELETE /api/user/notifications — clear all */
export const clearAll = async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.userId });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
