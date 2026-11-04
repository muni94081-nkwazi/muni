import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import validateBody from '../middleware/validateRequest.js';
import { updateProfileSchema, updatePreferencesSchema } from '../validators/user.validators.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

router.get('/me', authenticate, userController.getMe);
router.patch('/me', authenticate, validateBody(updateProfileSchema), userController.updateMe);

router.get('/me/preferences', authenticate, userController.getMyPreferences);
router.patch(
  '/me/preferences',
  authenticate,
  validateBody(updatePreferencesSchema),
  userController.updateMyPreferences,
);

// Internal — notification-service resolves recipient channels here.
router.get('/:userId/contact-profile', userController.getContactProfile);

export default router;
