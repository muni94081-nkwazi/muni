import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import validateBody from '../middleware/validateRequest.js';
import { createAddressSchema, updateAddressSchema } from '../validators/address.validators.js';
import * as addressController from '../controllers/address.controller.js';

const router = Router();

// Every route here is scoped to req.user.id — a user can only ever read or
// mutate their own address book, so there is no :userId in the public paths.
router.get('/', authenticate, addressController.list);
router.post('/', authenticate, validateBody(createAddressSchema), addressController.create);
router.get('/:id', authenticate, addressController.getById);
router.patch('/:id', authenticate, validateBody(updateAddressSchema), addressController.update);
router.post('/:id/default', authenticate, addressController.setDefault);
router.delete('/:id', authenticate, addressController.remove);

export default router;
