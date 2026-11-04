import { Router } from 'express';
import {
  CreateStationSchema,
  UpdateOperatingHoursSchema,
  CheckInPackageSchema,
  CheckOutPackageSchema,
  StationIdParams,
} from '../models/validation.schemas.js';
import { validateBody, validateParams } from '../../../../shared/http/validation.middleware.js';
import {
  checkInPackage,
  checkOutPackage,
  createStation,
  getInventory,
  getStation,
  listStations,
  updateOperatingHours,
} from '../controllers/pickup-station.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/pickup-stations', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS'), validateBody(CreateStationSchema), createStation);
router.get('/pickup-stations', listStations);
router.get('/pickup-stations/:id', getStation);
router.patch('/pickup-stations/:id/hours', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS'), validateParams(StationIdParams), validateBody(UpdateOperatingHoursSchema), updateOperatingHours);
router.get('/pickup-stations/:id/inventory', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS', 'ROLE_STATION_AGENT'), getInventory);
router.post('/pickup-stations/:id/checkin', requireAuth, requireRole('ROLE_OPS', 'ROLE_STATION_AGENT'), validateParams(StationIdParams), validateBody(CheckInPackageSchema), checkInPackage);
router.post('/pickup-stations/:id/checkout', requireAuth, requireRole('ROLE_OPS', 'ROLE_STATION_AGENT'), validateParams(StationIdParams), validateBody(CheckOutPackageSchema), checkOutPackage);

export default router;
