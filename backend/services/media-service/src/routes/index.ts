import { Router } from 'express';
import { mediaController } from '../controllers/media.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import multerLib from 'multer';

const multer = multerLib as any;

// Memory storage for multer to pass buffers to our service
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // max 20MB
  },
});

const router = Router();

// Public routes (none for upload/delete, maybe get metadata could be public but leaving simple for now)
router.get('/:id', mediaController.getMetadata);

// Auth required
router.use(requireAuth);
router.post('/upload', upload.single('file'), mediaController.uploadSingle);
router.post('/upload/batch', upload.array('files', 10), mediaController.uploadBatch);
router.delete('/:id', mediaController.deleteFile);
router.get('/user/:userId', mediaController.listUserFiles);

export default router;
