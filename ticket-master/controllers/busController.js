import Bus from '../models/operator/busModel.js';
import Schedule from '../models/operator/busScheduleModel.js';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create cache directory if it doesn't exist
const cacheDir = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

export const getBusDetails = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId);
    if (!bus) {
      return res.status(404).json({ message: 'Bus not found' });
    }
    return res.json(bus);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// Image proxy for Google Drive images to bypass CORS restrictions
export const imageProxy = async (req, res) => {
  try {
    const fileId = req.query.id;

    if (!fileId) {
      return res.status(400).json({ message: 'File ID is required' });
    }

    // Set aggressive headers for CORS and caching
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cross-Origin-Embedder-Policy', 'credentialless');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

    // Check if we have a cached version
    const cachePath = path.join(cacheDir, `${fileId}.jpg`);
    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      const fileBuffer = fs.readFileSync(cachePath);
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Length', stat.size);
      return res.send(fileBuffer);
    }

    // We'll try multiple Google Drive URL formats to increase chances of success
    const urls = [
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    ];

    // Try each URL until we get a successful response
    let success = false;
    let imageData = null;

    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 8000, // 8 second timeout
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
            'Referer': 'https://drive.google.com/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          })
        });

        // If we got here, we have a successful response
        if (response.status === 200 && response.data) {
          const contentType = response.headers['content-type'] || 'image/jpeg';
          res.set('Content-Type', contentType);

          // Save to cache
          try {
            fs.writeFileSync(cachePath, Buffer.from(response.data));
          } catch (cacheError) {
          }

          res.send(response.data);
          success = true;
          break;
        }
      } catch (urlError) {
      }
    }

    // If all fetching methods failed, try redirect as last resort
    if (!success) {
      return res.redirect(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`);
    }
  } catch (error) {

    // Try to send a default fallback image
    try {
      const fallbackPath = path.join(__dirname, '..', 'public', 'image-not-found.svg');
      if (fs.existsSync(fallbackPath)) {
        res.set('Content-Type', 'image/svg+xml');
        return res.sendFile(fallbackPath);
      }
    } catch (fallbackError) {
    }

    // Last resort - just send an error response
    return res.status(500).json({
      message: 'Failed to fetch image',
      error: error.message
    });
  }
};

// Get bus seat data for a specific date
export const getBusSeatData = async (req, res) => {
  try {
    const { busId, date } = req.query;

    if (!busId) {
      return res.status(400).json({ success: false, message: 'Bus ID is required' });
    }

    // If no date is provided, use today's date
    const searchDate = date ? new Date(date) : new Date();

    // Format date to YYYY-MM-DD for string comparison
    const searchDateStr = searchDate.toISOString().split('T')[0];

    // Find schedules for this bus on the specified date
    const schedules = await Schedule.find({
      bus: busId,
      scheduleDates: {
        $elemMatch: {
          $gte: new Date(searchDateStr),
          $lt: new Date(new Date(searchDateStr).setDate(new Date(searchDateStr).getDate() + 1))
        }
      }
    }).populate('bus').populate('route');

    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No schedule found for this bus on the specified date'
      });
    }

    // Get the most relevant schedule (first one for now)
    const schedule = schedules[0];

    // Get seat data for this date
    let seatData = {
      available: [],
      booked: []
    };

    // First check date-specific seat data
    if (schedule.seats && schedule.seats.dates) {
      const scheduleDateStr = searchDate.toISOString().split('T')[0];

      // MongoDB stores dates as Map, so we need to check if the date exists
      const dateData = schedule.seats.dates.get(scheduleDateStr);

      if (dateData) {
        seatData = dateData;
      }
    }

    // If no date-specific data, fall back to global seat data
    if (seatData.available.length === 0 && seatData.booked.length === 0 &&
      schedule.seats && schedule.seats.global) {
      seatData = schedule.seats.global;
    }

    // Create the seat data structure needed by the frontend
    const busSeatData = [];

    // Define seat IDs based on the existing pattern
    const frontRowIds = ['B1', 'B3', 'B5', 'B7', 'B9', 'B11', 'B13', 'B15', 'B17'];
    const secondRowIds = ['B2', 'B4', 'B6', 'B8', 'B10', 'B12', 'B14', 'B16', 'B18'];
    const thirdRowId = ['19'];
    const fourthRowIds = ['A1', 'A3', 'A5', 'A7', 'A9', 'A11', 'A13', 'A15', 'A17'];
    const fifthRowIds = ['A2', 'A4', 'A6', 'A8', 'A10', 'A12', 'A14', 'A16', 'A18'];

    const allSeatIds = [
      ...frontRowIds,
      ...secondRowIds,
      ...thirdRowId,
      ...fourthRowIds,
      ...fifthRowIds
    ];

    // Get the price from the route
    const price = schedule.route.price || 1600;

    // Check for permanently booked seats
    try {
      const Seat = mongoose.model('Seat');
      const permanentlyBookedSeats = await Seat.find({
        busId: busId,
        isPermanentlyBooked: true
      });

      if (permanentlyBookedSeats.length > 0) {
        console.log(`Found ${permanentlyBookedSeats.length} permanently booked seats for bus ${busId}`);

        // Add these to the booked list if they're not already there
        permanentlyBookedSeats.forEach(seat => {
          if (seat.seatId && !seatData.booked.includes(seat.seatId)) {
            seatData.booked.push(seat.seatId);
            // Also remove from available if it's there
            seatData.available = seatData.available.filter(id => id !== seat.seatId);
          }
        });
      }
    } catch (error) {
      console.error('Error checking for permanently booked seats:', error);
    }

    // Build the complete seat data structure
    allSeatIds.forEach(seatId => {
      const seatStatus = seatData.booked.includes(seatId) ? 'booked' : 'available';
      busSeatData.push({
        id: seatId,
        status: seatStatus,
        price: price
      });
    });

    return res.json({
      success: true,
      data: {
        busSeatData,
        schedule: {
          _id: schedule._id,
          fromTime: schedule.fromTime,
          toTime: schedule.toTime,
          date: searchDateStr,
          route: {
            from: schedule.route.from,
            to: schedule.route.to,
            pickupPoints: schedule.route.pickupPoints || [],
            dropPoints: schedule.route.dropPoints || []
          }
        },
        bus: {
          name: schedule.bus.busName,
          busNumber: schedule.bus.busNumber
        }
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching seat data',
      error: error.message
    });
  }
};

export const getRoutePoints = async (req, res) => {
  try {
    const { busId, date } = req.query;

    if (!busId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Bus ID and date are required'
      });
    }

    // Find the schedule for the given bus and date
    const schedule = await Schedule.findOne({
      bus: busId,
      scheduleDates: {
        $elemMatch: {
          $eq: new Date(date)
        }
      }
    }).populate('route');

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'No schedule found for the given bus and date'
      });
    }

    // Format pickup points with times
    const pickupPoints = schedule.route.pickupPoints.map((point, index) => ({
      id: `pickup${index + 1}`,
      name: point,
      time: schedule.pickupTimes[index] || ''
    }));

    // Format drop points with times
    const dropPoints = schedule.route.dropPoints.map((point, index) => ({
      id: `drop${index + 1}`,
      name: point,
      time: schedule.dropTimes[index] || ''
    }));

    return res.json({
      success: true,
      data: {
        pickupPoints,
        dropPoints
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching route points',
      error: error.message
    });
  }
};

// Helper function to update seat status in schedule
const updateSeatStatus = async (scheduleId, date, seatIds, status) => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) return false;

    const dateStr = new Date(date).toISOString().split('T')[0];

    // Initialize seats structure if it doesn't exist
    if (!schedule.seats) {
      schedule.seats = {
        dates: new Map(),
        global: { available: [], booked: [] }
      };
    }

    // Initialize date-specific data if it doesn't exist
    if (!schedule.seats.dates.has(dateStr)) {
      schedule.seats.dates.set(dateStr, {
        available: schedule.seats.global.available,
        booked: schedule.seats.global.booked
      });
    }

    const dateData = schedule.seats.dates.get(dateStr);

    // Check permanently booked seats from the Schedule model
    if (!schedule.permanentlyBookedSeats) {
      schedule.permanentlyBookedSeats = [];
    }

    // If setting to 'available', first check if any of these seats are permanently booked
    if (status === 'available') {
      try {
        // First check Schedule's permanently booked seats
        let permanentlyBookedInSchedule = [];

        if (schedule.permanentlyBookedSeats && Array.isArray(schedule.permanentlyBookedSeats)) {
          // Check if we're dealing with the new format (array of objects with date and seats)
          if (schedule.permanentlyBookedSeats.length > 0 && schedule.permanentlyBookedSeats[0].date) {
            // New format with date-based structure
            console.log('Using new date-based permanentlyBookedSeats format');

            // Check all date entries for any permanently booked seats
            schedule.permanentlyBookedSeats.forEach(dateEntry => {
              const matchingSeats = seatIds.filter(id => dateEntry.seats.includes(id));
              permanentlyBookedInSchedule = [...permanentlyBookedInSchedule, ...matchingSeats];
            });
          } else {
            // Old format (flat array of seat IDs)
            console.log('Using old flat array permanentlyBookedSeats format');
            permanentlyBookedInSchedule = seatIds.filter(id =>
              schedule.permanentlyBookedSeats.includes(id)
            );
          }
        }

        if (permanentlyBookedInSchedule.length > 0) {
          console.log(`Skipping release for ${permanentlyBookedInSchedule.length} seats permanently booked in schedule`);
          seatIds = seatIds.filter(id => !permanentlyBookedInSchedule.includes(id));

          if (seatIds.length === 0) {
            console.log('All seats are permanently booked in schedule, skipping update');
            return true;
          }
        }

        // Then check Seat model
        const Seat = mongoose.model('Seat');
        const permanentlyBookedSeats = await Seat.find({
          busId: schedule.bus,
          seatId: { $in: seatIds },
          isPermanentlyBooked: true
        });

        if (permanentlyBookedSeats.length > 0) {
          // Filter out permanently booked seats from the operation
          const permanentSeatIds = permanentlyBookedSeats.map(seat => seat.seatId);
          console.log(`Skipping release for ${permanentSeatIds.length} permanently booked seats from Seat model`);

          // Remove permanently booked seats from the seatIds array
          seatIds = seatIds.filter(id => !permanentSeatIds.includes(id));

          if (seatIds.length === 0) {
            console.log('All seats are permanently booked in Seat model, skipping update');
            return true; // Return success since we're intentionally skipping
          }
        }

        // Finally, check for paid tickets for these seats
        const Ticket = mongoose.model('Ticket');
        const paidTicketsWithSeats = await Ticket.find({
          'ticketInfo.busId': schedule.bus,
          'ticketInfo.selectedSeats': { $in: seatIds },
          paymentStatus: 'paid'
        });

        if (paidTicketsWithSeats.length > 0) {
          console.log(`Found ${paidTicketsWithSeats.length} paid tickets with these seats`);

          // Collect all seat IDs from paid tickets
          const paidSeatIds = new Set();
          paidTicketsWithSeats.forEach(ticket => {
            if (ticket.ticketInfo && ticket.ticketInfo.selectedSeats) {
              ticket.ticketInfo.selectedSeats.forEach(seatId => {
                paidSeatIds.add(seatId);
              });
            }
          });

          // Filter out seats with paid tickets
          seatIds = seatIds.filter(id => !paidSeatIds.has(id));

          if (seatIds.length === 0) {
            console.log('All seats have paid tickets, skipping update');
            return true;
          }

          // Mark these seats as permanently booked 
          const seatIdsFromPaidTickets = Array.from(paidSeatIds);
          if (!schedule.permanentlyBookedSeats) {
            schedule.permanentlyBookedSeats = [];
          }

          // Add any seats with paid tickets to the permanentlyBookedSeats array using the new structure
          if (schedule.permanentlyBookedSeats.length > 0 && schedule.permanentlyBookedSeats[0].date) {
            // Using the new date-based structure
            console.log('Adding seats to date-based permanentlyBookedSeats structure');

            // Format the date for storage
            const formattedDate = new Date(date).toISOString().split('T')[0];

            // Find if there's already an entry for this date
            let dateEntry = schedule.permanentlyBookedSeats.find(entry => entry.date === formattedDate);

            if (dateEntry) {
              // Add seats to the existing date entry
              seatIdsFromPaidTickets.forEach(seatId => {
                if (!dateEntry.seats.includes(seatId)) {
                  dateEntry.seats.push(seatId);
                  console.log(`Added seat ${seatId} to permanentlyBookedSeats for date ${formattedDate}`);
                }
              });
            } else {
              // Create a new entry for this date
              schedule.permanentlyBookedSeats.push({
                date: formattedDate,
                seats: [...seatIdsFromPaidTickets]
              });
              console.log(`Created new entry in permanentlyBookedSeats for date ${formattedDate} with ${seatIdsFromPaidTickets.length} seats`);
            }
          } else {
            // Old format (flat array) - keep for backward compatibility during migration
            console.log('Using old format for permanentlyBookedSeats');

            // Add any seats that aren't already in the permanently booked list
            seatIdsFromPaidTickets.forEach(seatId => {
              if (!schedule.permanentlyBookedSeats.includes(seatId)) {
                schedule.permanentlyBookedSeats.push(seatId);
                console.log(`Added seat ${seatId} to permanentlyBookedSeats (old format)`);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error checking for permanently booked seats:', error);
        // Continue with the update if there's an error in the check
      }
    }

    // If there are no seats left to update, we're done
    if (seatIds.length === 0) {
      console.log('No seats left to update after permanent booking checks');
      await schedule.save(); // Save the schedule with any updates to permanentlyBookedSeats
      return true;
    }

    // Update seat status for remaining seats
    seatIds.forEach(seatId => {
      if (status === 'booked') {
        dateData.available = dateData.available.filter(id => id !== seatId);
        if (!dateData.booked.includes(seatId)) {
          dateData.booked.push(seatId);
        }
      } else {
        dateData.booked = dateData.booked.filter(id => id !== seatId);
        if (!dateData.available.includes(seatId)) {
          dateData.available.push(seatId);
        }
      }
    });

    await schedule.save();
    return true;
  } catch (error) {
    console.error('Error in updateSeatStatus:', error);
    return false;
  }
};

// reserveSeatsTemporarily to update seat status
export const reserveSeatsTemporarily = async (req, res) => {
  try {
    const { busId, date, seatIds } = req.body;

    if (!busId || !date || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Bus ID, date, and seat IDs are required'
      });
    }

    // Format date to YYYY-MM-DD for string comparison
    const searchDateStr = new Date(date).toISOString().split('T')[0];

    // Find schedules for this bus on the specified date
    const schedule = await Schedule.findOne({
      bus: busId,
      scheduleDates: {
        $elemMatch: {
          $gte: new Date(searchDateStr),
          $lt: new Date(new Date(searchDateStr).setDate(new Date(searchDateStr).getDate() + 1))
        }
      }
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'No schedule found for this bus on the specified date'
      });
    }

    // Check if seats are already booked or reserved
    let seatData = {
      available: [],
      booked: []
    };

    // First check date-specific seat data
    if (schedule.seats && schedule.seats.dates) {
      const dateData = schedule.seats.dates.get(searchDateStr);
      if (dateData) {
        seatData = dateData;
      }
    }

    // If no date-specific data, fall back to global seat data
    if (seatData.available.length === 0 && seatData.booked.length === 0 &&
      schedule.seats && schedule.seats.global) {
      seatData = schedule.seats.global;
    }

    // Check if any of the requested seats are already booked
    const alreadyBooked = seatIds.filter(seatId => seatData.booked.includes(seatId));

    if (alreadyBooked.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following seats are already booked: ${alreadyBooked.join(', ')}`
      });
    }

    // Also check if any of the requested seats are permanently booked in the Seats collection
    try {
      const Seat = mongoose.model('Seat');
      const permanentlyBookedSeats = await Seat.find({
        busId,
        seatId: { $in: seatIds },
        isPermanentlyBooked: true
      });

      if (permanentlyBookedSeats.length > 0) {
        const permanentSeatIds = permanentlyBookedSeats.map(seat => seat.seatId);
        return res.status(400).json({
          success: false,
          message: `The following seats are already permanently booked: ${permanentSeatIds.join(', ')}`
        });
      }
    } catch (error) {
      console.error('Error checking for permanently booked seats:', error);
      // Continue if there's an error in the check
    }

    // Generate a unique reservation ID
    const reservationId = `${busId}_${Date.now()}`;

    // Set expiration time (10 minutes from now)
    const expirationTime = new Date(Date.now() + 10 * 60 * 1000);

    // Update seat status in database
    const statusUpdated = await updateSeatStatus(schedule._id, date, seatIds, 'booked');
    if (!statusUpdated) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update seat status'
      });
    }

    // Store reservation in memory
    global.seatReservations = global.seatReservations || {};
    global.seatReservations[reservationId] = {
      busId,
      date: searchDateStr,
      seatIds,
      expirationTime,
      schedule: schedule._id
    };

    // Store timeouts for cancellation
    global.reservationTimers = global.reservationTimers || {};

    // Setup cleanup after 10 minutes
    global.reservationTimers[reservationId] = setTimeout(async () => {
      // Remove the reservation and update seat status
      if (global.seatReservations && global.seatReservations[reservationId]) {
        // Skip releasing if this reservation has been paid and processed
        if (global.seatReservations[reservationId].paidAndProcessed) {
          console.log(`Skipping release for paid reservation: ${reservationId}`);
          delete global.seatReservations[reservationId];
          delete global.reservationTimers[reservationId];
          return;
        }

        // Check if there's a ticket with these seats that has been paid for
        try {
          const Ticket = mongoose.model('Ticket');

          // Get the seat IDs from the reservation
          const { seatIds, busId } = global.seatReservations[reservationId];

          // Check if there's a paid ticket with these seat IDs
          const paidTicket = await Ticket.findOne({
            'ticketInfo.busId': busId,
            'ticketInfo.selectedSeats': { $in: seatIds },
            paymentStatus: 'paid'
          });

          if (paidTicket) {
            console.log(`Skipping release for seats that have a paid ticket: ${paidTicket._id}`);

            // Double-check: update the Seat model to ensure seats are permanently booked
            try {
              const Seat = mongoose.model('Seat');
              for (const seatId of seatIds) {
                await Seat.updateOne(
                  { busId, seatId },
                  {
                    $set: {
                      status: 'booked',
                      isPermanentlyBooked: true,
                      ticketId: paidTicket._id,
                      bookingId: paidTicket.bookingId,
                      lastUpdated: new Date()
                    }
                  },
                  { upsert: true }
                );
              }
              console.log(`Reinforced booking for ${seatIds.length} seats with ticket ${paidTicket._id}`);
            } catch (seatUpdateError) {
              console.error('Error updating seats:', seatUpdateError);
            }

            delete global.seatReservations[reservationId];
            delete global.reservationTimers[reservationId];
            return;
          }

          // Also check if the seats are marked as permanently booked
          const Seat = mongoose.model('Seat');
          const permanentlyBookedSeats = await Seat.find({
            busId,
            seatId: { $in: seatIds },
            isPermanentlyBooked: true
          });

          if (permanentlyBookedSeats.length > 0) {
            console.log(`Skipping release for ${permanentlyBookedSeats.length} permanently booked seats`);

            // Only release seats that aren't permanently booked
            const permanentSeatIds = permanentlyBookedSeats.map(seat => seat.seatId);
            const seatsToRelease = seatIds.filter(id => !permanentSeatIds.includes(id));

            if (seatsToRelease.length > 0) {
              await updateSeatStatus(schedule._id, date, seatsToRelease, 'available');
              console.log(`Released ${seatsToRelease.length} non-permanent seats`);
            }

            delete global.seatReservations[reservationId];
            delete global.reservationTimers[reservationId];
            return;
          }
        } catch (error) {
          console.error('Error checking ticket status before releasing seats:', error);
          // Continue with seat release if there's an error in the check
        }

        // If we get here, it's safe to release the seats
        await updateSeatStatus(schedule._id, date, seatIds, 'available');
        console.log(`Releasing seats for expired reservation: ${reservationId}`);
        delete global.seatReservations[reservationId];
        delete global.reservationTimers[reservationId];
      }
    }, 10 * 60 * 1000);

    return res.json({
      success: true,
      data: {
        reservationId,
        expirationTime,
        seatIds
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while reserving seats',
      error: error.message
    });
  }
};

// releaseReservedSeats to update seat status
export const releaseReservedSeats = async (req, res) => {
  try {
    const { reservationId } = req.params;

    if (!reservationId) {
      return res.status(400).json({
        success: false,
        message: 'Reservation ID is required'
      });
    }

    // Check if reservation exists
    if (!global.seatReservations || !global.seatReservations[reservationId]) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found or already released'
      });
    }

    const reservation = global.seatReservations[reservationId];

    // Update seat status in database
    const statusUpdated = await updateSeatStatus(
      reservation.schedule,
      reservation.date,
      reservation.seatIds,
      'available'
    );

    if (!statusUpdated) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update seat status'
      });
    }

    // Remove the reservation
    delete global.seatReservations[reservationId];

    return res.json({
      success: true,
      message: 'Seats released successfully'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while releasing seats',
      error: error.message
    });
  }
};

// Check reservation status
export const checkReservationStatus = async (req, res) => {
  try {
    const { reservationId } = req.params;

    if (!reservationId) {
      return res.status(400).json({
        success: false,
        message: 'Reservation ID is required'
      });
    }

    // Check if reservation exists
    if (!global.seatReservations || !global.seatReservations[reservationId]) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found or expired'
      });
    }

    const reservation = global.seatReservations[reservationId];

    // Check if reservation is expired
    if (new Date() > new Date(reservation.expirationTime)) {
      delete global.seatReservations[reservationId];
      return res.status(400).json({
        success: false,
        message: 'Reservation has expired'
      });
    }

    return res.json({
      success: true,
      data: {
        ...reservation,
        timeRemaining: Math.floor((new Date(reservation.expirationTime) - new Date()) / 1000)
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while checking reservation',
      error: error.message
    });
  }
};

// Get custom price for specific pickup and drop points
export const getCustomPrice = async (req, res) => {
  try {
    const { busId, pickupPointId, dropPointId, date } = req.query;

    if (!busId || !pickupPointId || !dropPointId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Bus ID, pickup point, drop point, and date are required'
      });
    }

    // Log for debugging
    console.log('Fetching custom price for:', { busId, pickupPointId, dropPointId, date });

    // Find the schedule for the given bus and date
    const schedule = await Schedule.findOne({
      bus: busId,
      scheduleDates: {
        $elemMatch: {
          $eq: new Date(date)
        }
      }
    }).populate('route');

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'No schedule found for the given bus and date'
      });
    }

    // Extract pickup and drop point names from the IDs
    const pickupPointIndex = parseInt(pickupPointId.replace('pickup', '')) - 1;
    const dropPointIndex = parseInt(dropPointId.replace('drop', '')) - 1;

    if (
      pickupPointIndex < 0 ||
      pickupPointIndex >= schedule.route.pickupPoints.length ||
      dropPointIndex < 0 ||
      dropPointIndex >= schedule.route.dropPoints.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup or drop point ID'
      });
    }

    const pickupPointName = schedule.route.pickupPoints[pickupPointIndex];
    const dropPointName = schedule.route.dropPoints[dropPointIndex];

    // Find custom price for these points
    const customPriceEntry = schedule.route.customPrices.find(
      cp => cp.origin === pickupPointName && cp.drop === dropPointName
    );

    if (customPriceEntry) {
      console.log('Custom price found:', customPriceEntry.price);
      return res.json({
        success: true,
        data: {
          customPrice: customPriceEntry.price,
          basePrice: schedule.route.price,
          pickupPoint: pickupPointName,
          dropPoint: dropPointName
        }
      });
    } else {
      console.log('No custom price found, using base price:', schedule.route.price);
      return res.json({
        success: true,
        data: {
          customPrice: null,
          basePrice: schedule.route.price,
          pickupPoint: pickupPointName,
          dropPoint: dropPointName
        }
      });
    }
  } catch (error) {
    console.error('Error fetching custom price:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching custom price',
      error: error.message
    });
  }
};

// Get available custom prices for a bus route
export const getAvailableCustomPrices = async (req, res) => {
  try {
    const { busId, date } = req.query;

    if (!busId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Bus ID and date are required'
      });
    }

    // Find the schedule for the given bus and date
    const schedule = await Schedule.findOne({
      bus: busId,
      scheduleDates: {
        $elemMatch: {
          $eq: new Date(date)
        }
      }
    }).populate('route');

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'No schedule found for the given bus and date'
      });
    }

    // Map custom prices to response format with pickup and drop point IDs
    const availableCustomPrices = schedule.route.customPrices.map(cp => {
      const pickupPointIndex = schedule.route.pickupPoints.findIndex(pp => pp === cp.origin);
      const dropPointIndex = schedule.route.dropPoints.findIndex(dp => dp === cp.drop);

      return {
        pickupPointId: pickupPointIndex >= 0 ? `pickup${pickupPointIndex + 1}` : null,
        dropPointId: dropPointIndex >= 0 ? `drop${dropPointIndex + 1}` : null,
        pickupPoint: cp.origin,
        dropPoint: cp.drop,
        price: cp.price,
        basePrice: schedule.route.price,
        discount: schedule.route.price - cp.price
      };
    }).filter(cp => cp.pickupPointId && cp.dropPointId); // Only include valid ones

    return res.json({
      success: true,
      data: availableCustomPrices
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching available custom prices',
      error: error.message
    });
  }
};

// Search buses by name and number
export const searchBuses = async (req, res) => {
  try {
    const { busName, busNumber } = req.query;

    if (!busName && !busNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search parameter'
      });
    }

    // Build query object
    const searchQuery = {};
    if (busName) searchQuery.busName = busName;
    if (busNumber) searchQuery.busNumber = busNumber;

    console.log(`Searching for buses with query:`, searchQuery);

    const Bus = mongoose.model('Bus');
    const buses = await Bus.find(searchQuery);

    return res.status(200).json(buses);
  } catch (error) {
    console.error('Error searching buses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search buses',
      error: error.message
    });
  }
};
