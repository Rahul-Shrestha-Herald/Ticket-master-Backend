import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Generates a styled A5-landscape boarding-pass PDF with embedded QR code.
 * @param {Object} ticket  - Ticket mongoose document
 * @param {Object} payment - Payment mongoose document
 * @returns {Promise<Buffer>}
 */
export const generateTicketPDF = async (ticket, payment) => {
    // ── Build QR data string (same format as frontend) ──────────────
    const seats = Array.isArray(ticket.ticketInfo.selectedSeats)
        ? ticket.ticketInfo.selectedSeats.join(', ')
        : ticket.ticketInfo.selectedSeats || 'N/A';

    const journeyDateStr = ticket.ticketInfo.date
        ? new Date(ticket.ticketInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    const qrText = [
        `Booking ID: ${ticket.bookingId}`,
        `Passenger: ${ticket.passengerInfo.name}`,
        `Contact: ${ticket.passengerInfo.phone}`,
        `Journey: ${ticket.ticketInfo.fromLocation} → ${ticket.ticketInfo.toLocation}`,
        `Date: ${journeyDateStr}`,
        `Bus: ${ticket.ticketInfo.busName} (${ticket.ticketInfo.busNumber})`,
        `Departure: ${ticket.ticketInfo.departureTime || 'N/A'}`,
        `Arrival: ${ticket.ticketInfo.arrivalTime || 'N/A'}`,
        `Seats: ${seats}`,
        `Pickup: ${ticket.ticketInfo.pickupPoint || 'N/A'}`,
        `Drop: ${ticket.ticketInfo.dropPoint || 'N/A'}`,
        `Total: NPR ${ticket.price}`,
        `Status: Paid`,
    ].join('\n');

    // Generate QR as PNG buffer
    const qrBuffer = await QRCode.toBuffer(qrText, {
        type: 'png',
        width: 160,
        margin: 1,
        color: { dark: '#1a1a1a', light: '#ffffff' }
    });

    return new Promise((resolve, reject) => {
        try {
            // A5 landscape: 595 × 420 pt
            const doc = new PDFDocument({ size: [595, 420], margin: 0 });
            const chunks = [];
            doc.on('data', c => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const BLUE   = '#2563EB';
            const DARK   = '#111827';
            const MID    = '#374151';
            const LIGHT  = '#F3F4F6';
            const WHITE  = '#FFFFFF';
            const GREEN  = '#16A34A';
            const W      = 595;
            const H      = 420;
            const PAD    = 28;

            // ── Background ───────────────────────────────────────────────
            doc.rect(0, 0, W, H).fill('#F8FAFC');

            // ── Left panel (blue) ────────────────────────────────────────
            const leftW = 200;
            doc.rect(0, 0, leftW, H).fill(BLUE);

            // Brand
            doc.fillColor(WHITE).fontSize(16).font('Helvetica-Bold')
                .text('TICKET', PAD, 28, { width: leftW - PAD * 2 });
            doc.fillColor('#BFDBFE').fontSize(16).font('Helvetica-Bold')
                .text('MASTER', PAD, 46, { width: leftW - PAD * 2 });

            doc.fillColor('#93C5FD').fontSize(7).font('Helvetica')
                .text('E-TICKET / BOARDING PASS', PAD, 68, { width: leftW - PAD * 2 });

            // Divider
            doc.moveTo(PAD, 84).lineTo(leftW - PAD, 84).strokeColor('#3B82F6').lineWidth(0.5).stroke();

            // Route big display
            doc.fillColor(WHITE).fontSize(22).font('Helvetica-Bold')
                .text(ticket.ticketInfo.fromLocation?.toUpperCase() || 'N/A', PAD, 96, { width: leftW - PAD * 2 });
            doc.fillColor('#93C5FD').fontSize(10).font('Helvetica')
                .text('▼', PAD, 124, { width: leftW - PAD * 2 });
            doc.fillColor(WHITE).fontSize(22).font('Helvetica-Bold')
                .text(ticket.ticketInfo.toLocation?.toUpperCase() || 'N/A', PAD, 138, { width: leftW - PAD * 2 });

            // Date & time
            doc.fillColor('#BFDBFE').fontSize(8).font('Helvetica').text('DATE', PAD, 174);
            doc.fillColor(WHITE).fontSize(10).font('Helvetica-Bold').text(journeyDateStr, PAD, 184, { width: leftW - PAD * 2 });

            doc.fillColor('#BFDBFE').fontSize(8).font('Helvetica').text('DEPARTURE', PAD, 202);
            doc.fillColor(WHITE).fontSize(10).font('Helvetica-Bold')
                .text(ticket.ticketInfo.departureTime || 'N/A', PAD, 212, { width: leftW - PAD * 2 });

            doc.fillColor('#BFDBFE').fontSize(8).font('Helvetica').text('ARRIVAL', PAD, 230);
            doc.fillColor(WHITE).fontSize(10).font('Helvetica-Bold')
                .text(ticket.ticketInfo.arrivalTime || 'N/A', PAD, 240, { width: leftW - PAD * 2 });

            // Seats pill
            doc.roundedRect(PAD, 262, leftW - PAD * 2, 26, 5).fill('#1D4ED8');
            doc.fillColor('#BFDBFE').fontSize(7).font('Helvetica').text('SEATS', PAD, 266, { width: leftW - PAD * 2, align: 'center' });
            doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
                .text(seats, PAD, 275, { width: leftW - PAD * 2, align: 'center' });

            // Status badge
            doc.roundedRect(PAD, 300, leftW - PAD * 2, 22, 4).fill(GREEN);
            doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
                .text('✓  CONFIRMED & PAID', PAD, 307, { width: leftW - PAD * 2, align: 'center' });

            // Booking ID at bottom of left panel
            doc.fillColor('#93C5FD').fontSize(7).font('Helvetica')
                .text('BOOKING ID', PAD, 340, { width: leftW - PAD * 2 });
            doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
                .text(ticket.bookingId, PAD, 350, { width: leftW - PAD * 2 });

            // ── Tear line ────────────────────────────────────────────────
            doc.save();
            doc.dash(4, { space: 4 });
            doc.moveTo(leftW, 20).lineTo(leftW, H - 20).strokeColor('#CBD5E1').lineWidth(1).stroke();
            doc.restore();

            // ── Right panel ──────────────────────────────────────────────
            const rX = leftW + 20;
            const rW = W - leftW - 20;

            // Section helper
            const section = (title, y) => {
                doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text(title, rX, y, { width: rW - 20 });
                doc.moveTo(rX, y + 11).lineTo(rX + rW - 20, y + 11).strokeColor('#DBEAFE').lineWidth(0.5).stroke();
                return y + 16;
            };

            const row = (label, value, x, y, w) => {
                doc.fillColor('#6B7280').fontSize(7).font('Helvetica').text(label, x, y, { width: w });
                doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text(value || 'N/A', x, y + 9, { width: w });
            };

            // Passenger
            let y = PAD;
            y = section('PASSENGER DETAILS', y);
            row('FULL NAME', ticket.passengerInfo.name, rX, y, rW / 2 - 10);
            row('PHONE', ticket.passengerInfo.phone, rX + rW / 2, y, rW / 2 - 20);
            y += 26;
            if (ticket.passengerInfo.email) {
                row('EMAIL', ticket.passengerInfo.email, rX, y, rW - 20);
                y += 26;
            }

            // Journey
            y = section('JOURNEY DETAILS', y);
            row('BUS NAME', ticket.ticketInfo.busName, rX, y, rW / 2 - 10);
            row('BUS NUMBER', ticket.ticketInfo.busNumber, rX + rW / 2, y, rW / 2 - 20);
            y += 26;
            row('PICKUP POINT', ticket.ticketInfo.pickupPoint || 'N/A', rX, y, rW / 2 - 10);
            row('DROP POINT', ticket.ticketInfo.dropPoint || 'N/A', rX + rW / 2, y, rW / 2 - 20);
            y += 26;

            // Payment
            y = section('PAYMENT DETAILS', y);
            const paidAt = payment.paidAt
                ? new Date(payment.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'N/A';
            row('AMOUNT PAID', `NPR ${ticket.price}`, rX, y, rW / 2 - 10);
            row('PAID ON', paidAt, rX + rW / 2, y, rW / 2 - 20);
            y += 26;
            row('METHOD', (payment.paymentMethod || 'Khalti').toUpperCase(), rX, y, rW / 2 - 10);
            row('TXN ID', payment.transactionId || payment.pidx || 'N/A', rX + rW / 2, y, rW / 2 - 20);
            y += 30;

            // ── QR code ──────────────────────────────────────────────────
            const qrSize = 100;
            const qrX = rX + rW - qrSize - 20;
            const qrY = H - qrSize - 36;

            // QR background card
            doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 24, 6).fill(WHITE)
                .roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 24, 6).stroke('#E5E7EB');
            doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
            doc.fillColor('#6B7280').fontSize(6.5).font('Helvetica')
                .text('SCAN TO VERIFY', qrX - 6, qrY + qrSize + 8, { width: qrSize + 12, align: 'center' });

            // ── Footer note ──────────────────────────────────────────────
            doc.rect(leftW, H - 28, W - leftW, 28).fill(LIGHT);
            doc.fillColor('#9CA3AF').fontSize(6.5).font('Helvetica')
                .text('Please arrive 15 minutes before departure. This ticket is non-refundable. Ticket Master © 2025',
                    rX, H - 18, { width: rW - 20 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};
