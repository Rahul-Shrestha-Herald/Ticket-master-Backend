import express from 'express';
import multer from 'multer';
import { addBus, getOperatorBuses, getBusById, updateBus, deleteBus, uploadFile } from '../../controllers/operator/busController.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

// Configure multer with memory storage.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Accept multiple file fields.
const busUploadFields = upload.fields([
  { name: 'bluebook', maxCount: 1 },
  { name: 'roadPermit', maxCount: 1 },
  { name: 'insurance', maxCount: 1 },
  { name: 'busImageFront', maxCount: 1 },
  { name: 'busImageBack', maxCount: 1 },
  { name: 'busImageLeft', maxCount: 1 },
  { name: 'busImageRight', maxCount: 1 }
]);

router.post('/add', operatorAuth, busUploadFields, addBus);
router.get('/buses', operatorAuth, getOperatorBuses);
router.get('/buses/:id', operatorAuth, getBusById);
router.put('/buses/:id', operatorAuth, updateBus);
router.delete('/buses/:id', operatorAuth, deleteBus);
router.post('/upload-file', operatorAuth, upload.single('file'), uploadFile);

export default router;
