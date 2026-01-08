import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OperatorKYC from '../../models/operator/OperatorKYC.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = 'uploads/kyc';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
// Note: Multer destination runs during request parsing, so we use a temp directory
// and move files in the route handler after auth is verified
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use temp directory initially - we'll move files after auth verification
    const tempDir = path.join(uploadsDir, 'temp');
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    // Include operator ID in filename if available (will be set by auth middleware)
    const operatorId = req.operator?.id || 'temp';
    cb(null, `${operatorId}-${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and PDF are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 2MB limit'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  next();
};

// Multiple file upload fields for all steps
const uploadFields = upload.fields([
  { name: 'panImage', maxCount: 1 },
  { name: 'businessRegistrationImage', maxCount: 1 },
  { name: 'idProofImage', maxCount: 1 },
  { name: 'drivingLicenseImage', maxCount: 1 },
  { name: 'busPermitImage', maxCount: 1 },
  { name: 'vehicleRegistrationImage', maxCount: 1 }
]);

// Helper function to move files from temp to operator directory
const moveFileToOperatorDir = (file, operatorId) => {
  if (!file || !operatorId) return null;
  
  try {
    const tempPath = file.path;
    const operatorDir = path.join(uploadsDir, operatorId.toString());
    
    if (!fs.existsSync(operatorDir)) {
      fs.mkdirSync(operatorDir, { recursive: true });
    }
    
    const newPath = path.join(operatorDir, path.basename(tempPath));
    fs.renameSync(tempPath, newPath);
    return newPath;
  } catch (error) {
    console.error('Error moving file:', error);
    return null;
  }
};

// Save KYC progress (step-by-step)
router.post('/save-progress', operatorAuth, uploadFields, handleMulterError, async (req, res) => {
  try {
    // operatorAuth sets req.operator with { id, email } from JWT
    const operatorId = req.operator?.id;
    
    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Operator authentication required'
      });
    }
    const {
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      drivingLicenseNumber,
      busPermitNumber,
      vehicleRegistrationNumber,
      currentStep
    } = req.body;

    // Prepare KYC data based on current step
    const kycData = {
      operator: operatorId,
      currentStep: parseInt(currentStep) || 1,
      status: 'pending'
    };

    // Step 1: PAN Details
    if (panNumber) kycData.panNumber = panNumber;
    if (req.files?.panImage) {
      const movedPath = moveFileToOperatorDir(req.files.panImage[0], operatorId);
      if (movedPath) kycData.panImage = movedPath;
    }

    // Step 2: Business Details
    if (businessName) kycData.businessName = businessName;
    if (businessAddress) kycData.businessAddress = businessAddress;
    if (businessRegistrationNumber) kycData.businessRegistrationNumber = businessRegistrationNumber;
    if (req.files?.businessRegistrationImage) {
      const movedPath = moveFileToOperatorDir(req.files.businessRegistrationImage[0], operatorId);
      if (movedPath) kycData.businessRegistrationImage = movedPath;
    }

    // Step 3: ID Proof
    if (idProofType) kycData.idProofType = idProofType;
    if (idProofNumber) kycData.idProofNumber = idProofNumber;
    if (req.files?.idProofImage) {
      const movedPath = moveFileToOperatorDir(req.files.idProofImage[0], operatorId);
      if (movedPath) kycData.idProofImage = movedPath;
    }

    // Step 4: License & Permits
    if (drivingLicenseNumber) kycData.drivingLicenseNumber = drivingLicenseNumber;
    if (req.files?.drivingLicenseImage) {
      const movedPath = moveFileToOperatorDir(req.files.drivingLicenseImage[0], operatorId);
      if (movedPath) kycData.drivingLicenseImage = movedPath;
    }
    if (busPermitNumber) kycData.busPermitNumber = busPermitNumber;
    if (req.files?.busPermitImage) {
      const movedPath = moveFileToOperatorDir(req.files.busPermitImage[0], operatorId);
      if (movedPath) kycData.busPermitImage = movedPath;
    }
    if (vehicleRegistrationNumber) kycData.vehicleRegistrationNumber = vehicleRegistrationNumber;
    if (req.files?.vehicleRegistrationImage) {
      const movedPath = moveFileToOperatorDir(req.files.vehicleRegistrationImage[0], operatorId);
      if (movedPath) kycData.vehicleRegistrationImage = movedPath;
    }

    // Save or update KYC progress
    const existingKYC = await OperatorKYC.findOne({ operator: operatorId });
    
    if (existingKYC) {
      // Update existing KYC - merge with existing data
      Object.keys(kycData).forEach(key => {
        if (kycData[key] !== undefined && kycData[key] !== '') {
          existingKYC[key] = kycData[key];
        }
      });
      await existingKYC.save();
      res.json({
        success: true,
        message: 'KYC progress updated',
        currentStep: existingKYC.currentStep
      });
    } else {
      // Create new KYC
      const newKYC = new OperatorKYC(kycData);
      await newKYC.save();
      res.json({
        success: true,
        message: 'KYC progress saved',
        currentStep: newKYC.currentStep
      });
    }
  } catch (error) {
    console.error('Error saving KYC progress:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save KYC progress',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Submit KYC for verification
router.post('/submit', operatorAuth, uploadFields, handleMulterError, async (req, res) => {
  try {
    // operatorAuth sets req.operator with { id, email } from JWT
    const operatorId = req.operator?.id;
    
    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Operator authentication required'
      });
    }
    const {
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      drivingLicenseNumber,
      busPermitNumber,
      vehicleRegistrationNumber
    } = req.body;

    // Validate required fields
    if (!panNumber || !businessName || !businessAddress || !idProofNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    if (!req.files || !req.files.panImage || !req.files.idProofImage) {
      return res.status(400).json({
        success: false,
        message: 'PAN image and ID proof image are required'
      });
    }

    // Move files from temp to operator directory
    const panImagePath = moveFileToOperatorDir(req.files.panImage[0], operatorId);
    const idProofImagePath = moveFileToOperatorDir(req.files.idProofImage[0], operatorId);

    if (!panImagePath || !idProofImagePath) {
      return res.status(500).json({
        success: false,
        message: 'Failed to process uploaded files'
      });
    }

    // Prepare final KYC data
    const kycData = {
      operator: operatorId,
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber: businessRegistrationNumber || '',
      idProofType: idProofType || 'citizenship',
      idProofNumber,
      drivingLicenseNumber: drivingLicenseNumber || '',
      busPermitNumber: busPermitNumber || '',
      vehicleRegistrationNumber: vehicleRegistrationNumber || '',
      panImage: panImagePath,
      idProofImage: idProofImagePath,
      status: 'submitted',
      submittedAt: new Date(),
      currentStep: 4
    };

    if (req.files.businessRegistrationImage) {
      const movedPath = moveFileToOperatorDir(req.files.businessRegistrationImage[0], operatorId);
      if (movedPath) kycData.businessRegistrationImage = movedPath;
    }
    if (req.files.drivingLicenseImage) {
      const movedPath = moveFileToOperatorDir(req.files.drivingLicenseImage[0], operatorId);
      if (movedPath) kycData.drivingLicenseImage = movedPath;
    }
    if (req.files.busPermitImage) {
      const movedPath = moveFileToOperatorDir(req.files.busPermitImage[0], operatorId);
      if (movedPath) kycData.busPermitImage = movedPath;
    }
    if (req.files.vehicleRegistrationImage) {
      const movedPath = moveFileToOperatorDir(req.files.vehicleRegistrationImage[0], operatorId);
      if (movedPath) kycData.vehicleRegistrationImage = movedPath;
    }

    // Save KYC submission
    const existingKYC = await OperatorKYC.findOne({ operator: operatorId });
    
    if (existingKYC) {
      // Update existing KYC
      Object.assign(existingKYC, kycData);
      await existingKYC.save();
    } else {
      // Create new KYC
      const newKYC = new OperatorKYC(kycData);
      await newKYC.save();
    }

    res.json({
      success: true,
      message: 'KYC submitted successfully. Verification may take 2-3 business days.'
    });
  } catch (error) {
    console.error('Error submitting KYC:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit KYC',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get KYC status
router.get('/status', operatorAuth, async (req, res) => {
  try {
    const operatorId = req.operator?.id;
    
    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Operator authentication required'
      });
    }
    const kyc = await OperatorKYC.findOne({ operator: operatorId });
    
    if (kyc) {
      res.json({
        success: true,
        status: kyc.status,
        currentStep: kyc.currentStep,
        kycData: {
          panNumber: kyc.panNumber,
          businessName: kyc.businessName,
          businessAddress: kyc.businessAddress
        }
      });
    } else {
      res.json({
        success: true,
        status: 'pending',
        currentStep: 1
      });
    }
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch KYC status',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get saved KYC data (for form pre-filling)
router.get('/saved-data', operatorAuth, async (req, res) => {
  try {
    const operatorId = req.operator?.id;
    
    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Operator authentication required'
      });
    }
    const kyc = await OperatorKYC.findOne({ operator: operatorId });
    
    if (kyc) {
      res.json({
        success: true,
        kycData: {
          panNumber: kyc.panNumber || '',
          panImage: kyc.panImage || '',
          businessName: kyc.businessName || '',
          businessAddress: kyc.businessAddress || '',
          businessRegistrationNumber: kyc.businessRegistrationNumber || '',
          businessRegistrationImage: kyc.businessRegistrationImage || '',
          idProofType: kyc.idProofType || 'citizenship',
          idProofNumber: kyc.idProofNumber || '',
          idProofImage: kyc.idProofImage || '',
          drivingLicenseNumber: kyc.drivingLicenseNumber || '',
          drivingLicenseImage: kyc.drivingLicenseImage || '',
          busPermitNumber: kyc.busPermitNumber || '',
          busPermitImage: kyc.busPermitImage || '',
          vehicleRegistrationNumber: kyc.vehicleRegistrationNumber || '',
          vehicleRegistrationImage: kyc.vehicleRegistrationImage || ''
        },
        currentStep: kyc.currentStep || 1,
        status: kyc.status
      });
    } else {
      res.json({
        success: true,
        kycData: {},
        currentStep: 1,
        status: 'pending'
      });
    }
  } catch (error) {
    console.error('Error fetching saved KYC data:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch saved KYC data',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
