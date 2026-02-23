/**
 * Migration script to add default seat layout to buses that don't have one
 * Run this once to update existing buses in the database
 * 
 * Usage: node migrations/addDefaultSeatLayout.js
 */

import mongoose from 'mongoose';
import Bus from '../models/operator/busModel.js';
import dotenv from 'dotenv';

dotenv.config();

// Default seat layout (simple 10x4 layout with 37 seats)
const defaultSeatLayout = {
  rows: 5,
  cols: 11,
  layoutType: 'custom',
  seats: [
    // Row 1
    { seatId: 'A1', label: 'A1', row: 0, col: 0, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'A2', label: 'A2', row: 0, col: 1, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'B1', label: 'B1', row: 0, col: 3, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'B2', label: 'B2', row: 0, col: 4, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'C1', label: 'C1', row: 0, col: 6, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'C2', label: 'C2', row: 0, col: 7, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'C3', label: 'C3', row: 0, col: 8, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'C4', label: 'C4', row: 0, col: 9, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'D1', label: 'D1', row: 0, col: 10, status: 'available', x: 0, y: 0, seatType: 'regular' },
    // Row 2
    { seatId: 'D2', label: 'D2', row: 1, col: 0, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'D3', label: 'D3', row: 1, col: 1, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'E1', label: 'E1', row: 1, col: 3, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'E2', label: 'E2', row: 1, col: 4, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'E3', label: 'E3', row: 1, col: 6, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'E4', label: 'E4', row: 1, col: 7, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'F1', label: 'F1', row: 1, col: 8, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'F2', label: 'F2', row: 1, col: 9, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'F3', label: 'F3', row: 1, col: 10, status: 'available', x: 0, y: 0, seatType: 'regular' },
    // Row 3
    { seatId: 'F4', label: 'F4', row: 2, col: 10, status: 'available', x: 0, y: 0, seatType: 'regular' },
    // Row 4
    { seatId: 'G1', label: 'G1', row: 3, col: 0, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'G2', label: 'G2', row: 3, col: 1, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'G3', label: 'G3', row: 3, col: 3, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'G4', label: 'G4', row: 3, col: 4, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'H1', label: 'H1', row: 3, col: 6, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'H2', label: 'H2', row: 3, col: 7, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'H3', label: 'H3', row: 3, col: 8, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'H4', label: 'H4', row: 3, col: 9, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'H5', label: 'H5', row: 3, col: 10, status: 'available', x: 0, y: 0, seatType: 'regular' },
    // Row 5
    { seatId: 'I1', label: 'I1', row: 4, col: 0, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'I2', label: 'I2', row: 4, col: 1, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'I3', label: 'I3', row: 4, col: 3, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'I4', label: 'I4', row: 4, col: 4, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'J1', label: 'J1', row: 4, col: 6, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'J2', label: 'J2', row: 4, col: 7, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'J3', label: 'J3', row: 4, col: 8, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'J4', label: 'J4', row: 4, col: 9, status: 'available', x: 0, y: 0, seatType: 'regular' },
    { seatId: 'J5', label: 'J5', row: 4, col: 10, status: 'available', x: 0, y: 0, seatType: 'regular' },
  ]
};

async function addDefaultSeatLayout() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all buses without a seat layout
    const busesWithoutLayout = await Bus.find({
      $or: [
        { seatLayout: { $exists: false } },
        { 'seatLayout.seats': { $exists: false } },
        { 'seatLayout.seats': { $size: 0 } }
      ]
    });

    console.log(`Found ${busesWithoutLayout.length} buses without seat layout`);

    if (busesWithoutLayout.length === 0) {
      console.log('All buses already have seat layouts configured');
      process.exit(0);
    }

    // Update each bus with default layout
    let updated = 0;
    for (const bus of busesWithoutLayout) {
      try {
        bus.seatLayout = defaultSeatLayout;
        await bus.save();
        updated++;
        console.log(`✓ Updated bus: ${bus.busName} (${bus.busNumber})`);
      } catch (error) {
        console.error(`✗ Failed to update bus ${bus.busName}:`, error.message);
      }
    }

    console.log(`\nMigration complete: ${updated}/${busesWithoutLayout.length} buses updated`);
    process.exit(0);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
addDefaultSeatLayout();
