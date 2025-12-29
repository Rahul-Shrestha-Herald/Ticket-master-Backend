import Bus from '../../models/operator/busModel.js';
import { google } from 'googleapis';
import { Readable } from 'stream';

// Helper function: uploads a file (from memory) to Google Drive and returns the URL.
const uploadFileToDrive = async (file, folderId, operatorEmail, isPublic = false) => {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        const driveService = google.drive({ version: 'v3', auth });

        const fileMetadata = {
            name: file.originalname,
            parents: [folderId || ''],
        };

        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);

        const media = {
            mimeType: file.mimetype,
            body: bufferStream,
        };

        const response = await driveService.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });

        const fileId = response.data.id;
        if (!fileId) {
            return null;
        }

        // Set permissions based on isPublic flag
        if (isPublic) {
            // Public read access for anyone
            await driveService.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone',
                },
            });
        } else {
            // Private access for the operator's email
            if (!operatorEmail) {
                return null;
            }
            await driveService.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader',
                    type: 'user',
                    emailAddress: operatorEmail,
                },
            });
        }

        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    } catch (error) {
        return null;
    }
};

export const addBus = async (req, res) => {
    try {
        // Extract fields from req.body
        const { busName, busNumber, primaryContactNumber, secondaryContactNumber, busDescription, reservationPolicies, amenities } = req.body;

        // Validate required text fields
        if (!busName || !busNumber) {
            return res.status(400).json({
                success: false,
                message: "Bus Name and Bus Number are required."
            });
        }

        // Validate primary contact number
        if (!primaryContactNumber) {
            return res.status(400).json({
                success: false,
                message: "Primary Contact Number is required."
            });
        }

        // Parse JSON-stringified arrays for checkboxes
        const parsedReservationPolicies = reservationPolicies ? JSON.parse(reservationPolicies) : [];
        const parsedAmenities = amenities ? JSON.parse(amenities) : [];

        // Validate that at least one reservation policy and one amenity are selected
        if (!parsedReservationPolicies.length) {
            return res.status(400).json({
                success: false,
                message: "At least one reservation policy must be selected."
            });
        }
        if (!parsedAmenities.length) {
            return res.status(400).json({
                success: false,
                message: "At least one amenity must be selected."
            });
        }

        // Validate bus images (if provided)
        const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
        const imageFields = ['busImageFront', 'busImageBack', 'busImageLeft', 'busImageRight'];
        for (let field of imageFields) {
            if (req.files[field] && req.files[field][0]) {
                const file = req.files[field][0];
                if (!file.mimetype.startsWith('image/')) {
                    return res.status(400).json({
                        success: false,
                        message: `${field} must be an image file.`
                    });
                }
                if (file.size > MAX_IMAGE_SIZE) {
                    return res.status(400).json({
                        success: false,
                        message: `${field} must be less than 1MB.`
                    });
                }
            }
        }

        // Folder ID for bus-related files (documents and images)
        const folderId = process.env.GOOGLE_DRIVE_BUS_FOLDER_ID || '';

        // Upload files if provided
        let bluebookUrl = '';
        let roadPermitUrl = '';
        let insuranceUrl = '';
        let frontImageUrl = '';
        let backImageUrl = '';
        let leftImageUrl = '';
        let rightImageUrl = '';

        // Upload documents with operator access
        if (req.files.bluebook && req.files.bluebook[0]) {
            bluebookUrl = await uploadFileToDrive(req.files.bluebook[0], folderId, req.operator.email);
        }
        if (req.files.roadPermit && req.files.roadPermit[0]) {
            roadPermitUrl = await uploadFileToDrive(req.files.roadPermit[0], folderId, req.operator.email);
        }
        if (req.files.insurance && req.files.insurance[0]) {
            insuranceUrl = await uploadFileToDrive(req.files.insurance[0], folderId, req.operator.email);
        }

        // Upload bus images with public access
        if (req.files.busImageFront && req.files.busImageFront[0]) {
            frontImageUrl = await uploadFileToDrive(req.files.busImageFront[0], folderId, req.operator.email, true);
        }
        if (req.files.busImageBack && req.files.busImageBack[0]) {
            backImageUrl = await uploadFileToDrive(req.files.busImageBack[0], folderId, req.operator.email, true);
        }
        if (req.files.busImageLeft && req.files.busImageLeft[0]) {
            leftImageUrl = await uploadFileToDrive(req.files.busImageLeft[0], folderId, req.operator.email, true);
        }
        if (req.files.busImageRight && req.files.busImageRight[0]) {
            rightImageUrl = await uploadFileToDrive(req.files.busImageRight[0], folderId, req.operator.email, true);
        }

        // Create a new Bus document with the authenticated operator's id
        const newBus = new Bus({
            busName,
            busNumber,
            primaryContactNumber,
            secondaryContactNumber,
            busDescription,
            documents: {
                bluebook: bluebookUrl,
                roadPermit: roadPermitUrl,
                insurance: insuranceUrl,
            },
            reservationPolicies: parsedReservationPolicies,
            amenities: parsedAmenities,
            images: {
                front: frontImageUrl,
                back: backImageUrl,
                left: leftImageUrl,
                right: rightImageUrl,
            },
            createdBy: req.operator.id,  // using operator id from token payload
            verified: false,
        });

        await newBus.save();
        return res.status(201).json({ success: true, message: 'Bus added successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
};

// GET all buses for the logged-in operator
export const getOperatorBuses = async (req, res) => {
    try {
        const buses = await Bus.find({ createdBy: req.operator.id });
        res.json(buses);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
};

// GET details for a single bus (only if it belongs to the logged-in operator)
export const getBusById = async (req, res) => {
    try {
        const bus = await Bus.findOne({ _id: req.params.id, createdBy: req.operator.id });
        if (!bus) {
            return res.status(404).json({ success: false, message: 'Bus not found.' });
        }
        res.json(bus);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
};

// UPDATE a bus's details
// Allowed updates: busDescription, reservationPolicies, amenities, images
// Document images can only be updated if the bus is unverified.
export const updateBus = async (req, res) => {
    try {
        const bus = await Bus.findOne({ _id: req.params.id, createdBy: req.operator.id });
        if (!bus) {
            return res.status(404).json({ success: false, message: 'Bus not found.' });
        }

        // Update allowed fields
        const { busDescription, primaryContactNumber, secondaryContactNumber, reservationPolicies, amenities, images, documents } = req.body;

        if (busDescription !== undefined) bus.busDescription = busDescription;
        if (primaryContactNumber !== undefined) {
            if (!primaryContactNumber.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Primary Contact Number is required."
                });
            }
            bus.primaryContactNumber = primaryContactNumber;
        }
        if (secondaryContactNumber !== undefined) bus.secondaryContactNumber = secondaryContactNumber;
        if (reservationPolicies !== undefined) bus.reservationPolicies = reservationPolicies;
        if (amenities !== undefined) bus.amenities = amenities;
        if (images !== undefined) bus.images = images;

        // Update documents only if the bus is unverified
        if (!bus.verified && documents !== undefined) {
            bus.documents = documents;
        }

        const updatedBus = await bus.save();
        res.json({ success: true, message: 'Bus details updated successfully', bus: updatedBus });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
};

// DELETE a bus (only if it belongs to the logged-in operator)
export const deleteBus = async (req, res) => {
    try {
        const bus = await Bus.findOneAndDelete({ _id: req.params.id, createdBy: req.operator.id });
        if (!bus) {
            return res.status(404).json({ success: false, message: 'Bus not found.' });
        }
        res.json({ success: true, message: 'Bus deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
};

// New uploadFile endpoint
export const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file provided." });
        }

        const folderId = process.env.GOOGLE_DRIVE_BUS_FOLDER_ID || '';

        // Check if this is a bus image or a document based on the type field
        const fileType = req.body.type;

        // If it's a bus image (front, back, left, right), set isPublic to true
        const isPublic = ['front', 'back', 'left', 'right'].includes(fileType);

        const driveUrl = await uploadFileToDrive(req.file, folderId, req.operator.email, isPublic);

        if (!driveUrl) {
            return res.status(500).json({ success: false, message: "Failed to upload file to Drive." });
        }
        res.json({ success: true, driveUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error. Try again later." });
    }
};