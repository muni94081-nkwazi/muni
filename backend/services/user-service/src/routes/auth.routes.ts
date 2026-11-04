import { Router } from 'express';
import validateBody from '../middleware/validateRequest.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from '../validators/auth.validators.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// These paths are relative to wherever the gateway mounts this service,
// e.g. gateway "/api/v1/auth/*" -> user-service "/auth/*". See README.
router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refresh);
router.post('/logout', validateBody(refreshTokenSchema), authController.logout);
router.post('/forgot-password', validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), authController.resetPassword);

export default router;
