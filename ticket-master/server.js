import express from "express";
import cors from "cors";
import helmet from "helmet";
import 'dotenv/config';
import cookieParser from "cookie-parser";
import connectDB from './config/mongodb.js';

import authRouter from './routes/authRoutes.js';
import userRouter from "./routes/userRoutes.js";
import searchRouter from "./routes/searchRoutes.js";
import busRouter from "./routes/busRoutes.js";
import bookingRouter from "./routes/bookingRoutes.js";

import adminAuthRouter from './routes/admin/adminAuthRoutes.js';
import adminRouter from './routes/admin/adminRoutes.js';
import adminBusRouteRouter from './routes/admin/adminBusRouteRoutes.js';
import adminscheduleRouter from './routes/admin/scheduleRoutes.js';
import adminBookingRouter from './routes/admin/bookingRoutes.js';

import operatorAuthRouter from './routes/operator/operatorAuthRoutes.js';
import operatorRouter from './routes/operator/operatorRoutes.js';
import operatorBusRouter from './routes/operator/operatorBusRoutes.js';
import operatorBusRouteRouter from './routes/operator/operatorBusRouteRoutes.js';
import operatorBusScheduleRouter from './routes/operator/operatorBusScheduleRoutes.js';
import operatorBookingRouter from './routes/operator/operatorBookingRoutes.js';

// Import payment routes
import paymentRouter from './routes/paymentRoutes.js';

// Import reservation routes
import reservationRouter from './routes/reservationRoutes.js';

// Import support routes
import supportRouter from './routes/supportRoutes.js';

const app = express();
const port = process.env.PORT || 4000;
connectDB();

const allowedOrigins = [process.env.CLIENT_URL];

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet());

// API Endpoints
app.get('/', (req, res) => res.send("API is working fine"));
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/search', searchRouter);
app.use('/api/bus', busRouter);
app.use('/api/bookings', bookingRouter);

app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/routes', adminBusRouteRouter);
app.use('/api/admin/schedules', adminscheduleRouter);
app.use('/api/admin/bookings', adminBookingRouter);

app.use('/api/operator/auth', operatorAuthRouter);
app.use('/api/operator', operatorRouter);
app.use('/api/operator/bus', operatorBusRouter);
app.use('/api/operator/routes', operatorBusRouteRouter);
app.use('/api/operator/schedules', operatorBusScheduleRouter);
app.use('/api/operator/bookings', operatorBookingRouter);

// Payment routes
app.use('/api/payment', paymentRouter);

// Reservation routes
app.use('/api/reservation', reservationRouter);

// Support routes
app.use('/api/support', supportRouter);

app.listen(port, () => console.log(`Server started on PORT: ${port}`));
