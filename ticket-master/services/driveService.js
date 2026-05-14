import { google } from 'googleapis';
import { Readable } from 'stream';

/**
 * Upload a file buffer to Google Drive and return a public URL.
 * @param {Object} file - multer file object (buffer, mimetype, originalname)
 * @param {string} folderId - Google Drive folder ID
 * @returns {Promise<string|null>} public URL or null on failure
 */
export const uploadToDrive = async (file, folderId) => {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        const drive = google.drive({ version: 'v3', auth });

        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: file.originalname || `upload-${Date.now()}`,
                parents: [folderId],
            },
            media: {
                mimeType: file.mimetype,
                body: bufferStream,
            },
            fields: 'id',
            supportsAllDrives: true,
        });

        const fileId = response.data.id;
        if (!fileId) return null;

        // Make publicly readable
        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        // Return a direct thumbnail URL (works without auth)
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    } catch (err) {
        console.error('Drive upload error:', err.message);
        return null;
    }
};
