const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OperatorKYC = require('../../models/operator/OperatorKYC');
const auth = require('../../middleware/auth');

// Ensure uploads directory exists
const uploadsDir = 'uploads/kyc';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const operatorId = req.operator._id;
    const operatorDir = path.join(uploadsDir, operatorId.toString());
    
    if (!fs.existsSync(operatorDir)) {
      fs.mkdirSync(operatorDir, { recursive: true });
    }
    
    cb(null, operatorDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
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

// Multiple file upload fields
const uploadFields = upload.fields([
  { name: 'panImage', maxCount: 1 },
  { name: 'businessRegistrationImage', maxCount: 1 },
  { name: 'idProofImage', maxCount: 1 }
]);

// Save KYC progress
router.post('/save-progress', auth.operatorAuth, uploadFields, async (req, res) => {
  try {
    const operatorId = req.operator._id;
    const {
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      bankAccountNumber,
      bankName,
      accountHolderName,
      step
    } = req.body;

    // Prepare KYC data
    const kycData = {
      operator: operatorId,
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      bankAccountNumber,
      bankName,
      accountHolderName,
      step: parseInt(step) || 1,
      status: 'pending'
    };

    // Handle file uploads
    if (req.files) {
      if (req.files.panImage) {
        kycData.panImage = req.files.panImage[0].path;
      }
      if (req.files.businessRegistrationImage) {
        kycData.businessRegistrationImage = req.files.businessRegistrationImage[0].path;
      }
      if (req.files.idProofImage) {
        kycData.idProofImage = req.files.idProofImage[0].path;
      }
    }

    // Save or update KYC progress
    const existingKYC = await OperatorKYC.findOne({ operator: operatorId });
    
    if (existingKYC) {
      // Update existing KYC
      Object.assign(existingKYC, kycData);
      await existingKYC.save();
      res.json({
        success: true,
        message: 'KYC progress updated',
        step: kycData.step
      });
    } else {
      // Create new KYC
      const newKYC = new OperatorKYC(kycData);
      await newKYC.save();
      res.json({
        success: true,
        message: 'KYC progress saved',
        step: kycData.step
      });
    }
  } catch (error) {
    console.error('Error saving KYC progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save KYC progress'
    });
  }
});

// Submit KYC for verification
router.post('/submit', auth.operatorAuth, uploadFields, async (req, res) => {
  try {
    const operatorId = req.operator._id;
    const {
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      bankAccountNumber,
      bankName,
      accountHolderName
    } = req.body;

    // Validate required fields
    if (!panNumber || !businessName || !businessAddress || !idProofNumber || 
        !bankAccountNumber || !bankName || !accountHolderName) {
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

    // Prepare final KYC data
    const kycData = {
      operator: operatorId,
      panNumber,
      businessName,
      businessAddress,
      businessRegistrationNumber,
      idProofType,
      idProofNumber,
      bankAccountNumber,
      bankName,
      accountHolderName,
      panImage: req.files.panImage[0].path,
      idProofImage: req.files.idProofImage[0].path,
      status: 'submitted',
      submittedAt: new Date()
    };

    if (req.files.businessRegistrationImage) {
      kycData.businessRegistrationImage = req.files.businessRegistrationImage[0].path;
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
      message: 'Failed to submit KYC'
    });
  }
});

// Get KYC status
router.get('/status', auth.operatorAuth, async (req, res) => {
  try {
    const operatorId = req.operator._id;
    const kyc = await OperatorKYC.findOne({ operator: operatorId });
    
    if (kyc) {
      res.json({
        success: true,
        status: kyc.status,
        kycData: {
          panNumber: kyc.panNumber,
          businessName: kyc.businessName,
          businessAddress: kyc.businessAddress,
          // Don't send file paths for security
        }
      });
    } else {
      res.json({
        success: true,
        status: 'pending'
      });
    }
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KYC status'
    });
  }
});

// Get saved KYC data
router.get('/saved-data', auth.operatorAuth, async (req, res) => {
  try {
    const operatorId = req.operator._id;
    const kyc = await OperatorKYC.findOne({ operator: operatorId });
    
    if (kyc) {
      res.json({
        success: true,
        kycData: {
          panNumber: kyc.panNumber,
          businessName: kyc.businessName,
          businessAddress: kyc.businessAddress,
          businessRegistrationNumber: kyc.businessRegistrationNumber,
          idProofType: kyc.idProofType,
          idProofNumber: kyc.idProofNumber,
          bankAccountNumber: kyc.bankAccountNumber,
          bankName: kyc.bankName,
          accountHolderName: kyc.accountHolderName
        },
        step: kyc.step || 1
      });
    } else {
      res.json({
        success: true,
        kycData: {},
        step: 1
      });
    }
  } catch (error) {
    console.error('Error fetching saved KYC data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved KYC data'
    });
  }
});

module.exports = router;