import userModel from '../models/userModel.js';
import PointsHistory from '../models/tmPointsModel.js';

// Conversion constants
export const POINTS_EARN_RATE = 0.05;       // 5% of ticket amount → points
export const POINTS_REDEEM_RATE = 10 / 100; // 100 points = Rs. 10 → Rs. 0.10 per point

/**
 * Award TM Points after a successful payment.
 * Called internally from paymentController after payment is verified.
 */
export const awardPoints = async ({ userId, ticketId, bookingId, amountPaid }) => {
    try {
        const pointsEarned = Math.floor(amountPaid * POINTS_EARN_RATE);
        if (pointsEarned <= 0) return { success: true, pointsEarned: 0 };

        // Idempotency check — don't award if already earned for this ticket
        const alreadyAwarded = await PointsHistory.findOne({ userId, ticketId, type: 'earn' });
        if (alreadyAwarded) {
            console.log(`Points already awarded for ticket ${ticketId}, skipping`);
            return { success: true, pointsEarned: 0, alreadyProcessed: true };
        }

        const user = await userModel.findByIdAndUpdate(
            userId,
            { $inc: { tmPoints: pointsEarned } },
            { new: true }
        );

        if (!user) return { success: false, message: 'User not found' };

        await PointsHistory.create({
            userId,
            type: 'earn',
            points: pointsEarned,
            description: `Earned for booking ${bookingId}`,
            ticketId,
            bookingId,
            relatedAmount: amountPaid,
            balanceAfter: user.tmPoints
        });

        return { success: true, pointsEarned, newBalance: user.tmPoints };
    } catch (error) {
        console.error('Error awarding TM Points:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Validate and reserve points for redemption during checkout.
 * Returns the discount amount in Rs.
 */
export const calculateRedemption = (pointsToRedeem, userBalance) => {
    if (!pointsToRedeem || pointsToRedeem <= 0) return { valid: false, discount: 0 };
    if (pointsToRedeem > userBalance) return { valid: false, discount: 0, message: 'Insufficient TM Points' };
    // Must redeem in multiples of 100
    const redeemable = Math.floor(pointsToRedeem / 100) * 100;
    if (redeemable <= 0) return { valid: false, discount: 0, message: 'Minimum 100 TM Points required' };
    const discount = (redeemable / 100) * 10; // 100 pts = Rs. 10
    return { valid: true, points: redeemable, discount };
};

/**
 * Deduct points after a successful payment where points were redeemed.
 * Called internally from paymentController.
 */
export const redeemPoints = async ({ userId, ticketId, bookingId, pointsUsed, discountAmount }) => {
    try {
        // Idempotency check — don't deduct if already redeemed for this ticket
        const alreadyRedeemed = await PointsHistory.findOne({ userId, ticketId, type: 'redeem' });
        if (alreadyRedeemed) {
            console.log(`Points already redeemed for ticket ${ticketId}, skipping`);
            return { success: true, pointsUsed: 0, alreadyProcessed: true };
        }

        const user = await userModel.findById(userId);
        if (!user) return { success: false, message: 'User not found' };
        if (user.tmPoints < pointsUsed) return { success: false, message: 'Insufficient TM Points' };

        user.tmPoints -= pointsUsed;
        await user.save();

        await PointsHistory.create({
            userId,
            type: 'redeem',
            points: pointsUsed,
            description: `Redeemed for booking ${bookingId} (Rs. ${discountAmount} discount)`,
            ticketId,
            bookingId,
            relatedAmount: discountAmount,
            balanceAfter: user.tmPoints
        });

        return { success: true, pointsUsed, newBalance: user.tmPoints };
    } catch (error) {
        console.error('Error redeeming TM Points:', error);
        return { success: false, message: error.message };
    }
};

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/** GET /api/user/tm-points — get balance + recent history */
export const getTMPoints = async (req, res) => {
    try {
        const userId = req.userId;
        const user = await userModel.findById(userId).select('tmPoints name email');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const history = await PointsHistory.find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return res.json({
            success: true,
            tmPoints: user.tmPoints,
            history
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** POST /api/user/tm-points/validate — validate points before checkout */
export const validateRedemption = async (req, res) => {
    try {
        const userId = req.userId;
        const { pointsToRedeem } = req.body;

        const user = await userModel.findById(userId).select('tmPoints');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const result = calculateRedemption(Number(pointsToRedeem), user.tmPoints);
        if (!result.valid) {
            return res.status(400).json({ success: false, message: result.message || 'Invalid redemption' });
        }

        return res.json({
            success: true,
            pointsToRedeem: result.points,
            discountAmount: result.discount,
            remainingBalance: user.tmPoints - result.points
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
