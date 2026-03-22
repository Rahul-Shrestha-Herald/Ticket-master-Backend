import PDFDocument from 'pdfkit';

/**
 * Generates a PDF ticket buffer for a confirmed booking.
 * @param {Object} ticket - Ticket mongoose document
 * @param {Object} payment - Payment mongoose document
 * @returns {Promise<Buffer>} PDF as a Buffer
 */
export const generateTicketPDF = (ticket, payment) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A5', margin: 40 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const RED = '#f50a0a';
            const DARK = '#1a1a1a';
            const GRAY = '#555555';
            const LIGHT = '#f5f5f5';

            const pageW = doc.page.width;
            const margin = 40;
            const contentW = pageW - margin * 2;

            // ── Header bar ──────────────────────────────────────────────
            doc.rect(0, 0, pageW, 70).fill(RED);
            doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
                .text('TICKET MASTER', margin, 18, { width: contentW, align: 'center' });
            doc.fontSize(9).font('Helvetica')
                .text('E-Ticket / Booking Confirmation', margin, 44, { width: contentW, align: 'center' });

            // ── Booking ID badge ─────────────────────────────────────────
            doc.moveDown(0.5);
            const badgeY = 82;
            doc.rect(margin, badgeY, contentW, 28).fill(LIGHT);
            doc.fillColor(RED).fontSize(8).font('Helvetica-Bold')
                .text('BOOKING ID', margin + 10, badgeY + 6);
            doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold')
                .text(ticket.bookingId, margin + 10, badgeY + 15);

            // Status badge on right
            const statusText = ticket.status === 'confirmed' ? 'CONFIRMED' : ticket.status.toUpperCase();
            doc.rect(pageW - margin - 80, badgeY + 4, 80, 20).fill(RED);
            doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
                .text(statusText, pageW - margin - 80, badgeY + 10, { width: 80, align: 'center' });

            // ── Journey section ──────────────────────────────────────────
            const jY = badgeY + 44;
            doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('JOURNEY DETAILS', margin, jY);
            doc.moveTo(margin, jY + 11).lineTo(pageW - margin, jY + 11).strokeColor(RED).lineWidth(0.5).stroke();

            const col1 = margin;
            const col2 = margin + contentW / 2;
            let rowY = jY + 18;

            const field = (label, value, x, y, w) => {
                doc.fillColor(GRAY).fontSize(7).font('Helvetica').text(label, x, y, { width: w });
                doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text(value || 'N/A', x, y + 9, { width: w });
            };

            field('FROM', ticket.ticketInfo.fromLocation, col1, rowY, contentW / 2 - 10);
            field('TO', ticket.ticketInfo.toLocation, col2, rowY, contentW / 2);
            rowY += 30;

            const journeyDate = ticket.ticketInfo.date
                ? new Date(ticket.ticketInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'N/A';
            field('DATE', journeyDate, col1, rowY, contentW / 2 - 10);
            field('DEPARTURE', ticket.ticketInfo.departureTime || 'N/A', col2, rowY, contentW / 2);
            rowY += 30;

            field('BUS', `${ticket.ticketInfo.busName} (${ticket.ticketInfo.busNumber})`, col1, rowY, contentW);
            rowY += 30;

            field('SEATS', ticket.ticketInfo.selectedSeats.join(', '), col1, rowY, contentW / 2 - 10);
            field('ARRIVAL', ticket.ticketInfo.arrivalTime || 'N/A', col2, rowY, contentW / 2);
            rowY += 30;

            field('PICKUP POINT', ticket.ticketInfo.pickupPoint || 'N/A', col1, rowY, contentW / 2 - 10);
            field('DROP POINT', ticket.ticketInfo.dropPoint || 'N/A', col2, rowY, contentW / 2);
            rowY += 36;

            // ── Passenger section ────────────────────────────────────────
            doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('PASSENGER DETAILS', margin, rowY);
            doc.moveTo(margin, rowY + 11).lineTo(pageW - margin, rowY + 11).strokeColor(RED).lineWidth(0.5).stroke();
            rowY += 18;

            field('NAME', ticket.passengerInfo.name, col1, rowY, contentW / 2 - 10);
            field('PHONE', ticket.passengerInfo.phone, col2, rowY, contentW / 2);
            rowY += 30;

            if (ticket.passengerInfo.email) {
                field('EMAIL', ticket.passengerInfo.email, col1, rowY, contentW);
                rowY += 30;
            }

            // ── Payment section ──────────────────────────────────────────
            doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('PAYMENT DETAILS', margin, rowY);
            doc.moveTo(margin, rowY + 11).lineTo(pageW - margin, rowY + 11).strokeColor(RED).lineWidth(0.5).stroke();
            rowY += 18;

            const paidAt = payment.paidAt
                ? new Date(payment.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'N/A';
            field('AMOUNT PAID', `Rs. ${ticket.price}`, col1, rowY, contentW / 2 - 10);
            field('PAYMENT DATE', paidAt, col2, rowY, contentW / 2);
            rowY += 30;

            field('PAYMENT METHOD', (payment.paymentMethod || 'Khalti').toUpperCase(), col1, rowY, contentW / 2 - 10);
            field('TRANSACTION ID', payment.transactionId || payment.pidx || 'N/A', col2, rowY, contentW / 2);
            rowY += 36;

            // ── Footer ───────────────────────────────────────────────────
            doc.rect(0, doc.page.height - 40, pageW, 40).fill(DARK);
            doc.fillColor('white').fontSize(7).font('Helvetica')
                .text('Thank you for choosing Ticket Master. Please arrive 15 minutes before departure.',
                    margin, doc.page.height - 28, { width: contentW, align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};
