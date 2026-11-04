import { Request, Response, NextFunction } from 'express';
import { mediaService } from '../services/media.service.js';
import { MediaTypeSchema, MediaType } from '../models/media.model.js';

export class MediaController {
  async uploadSingle(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const type = MediaTypeSchema.parse(req.query.type || 'product');
      const userId = res.locals.userId;

      const record = await mediaService.uploadSingle(userId, req.file, type);
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  }

  async uploadBatch(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        res.status(400).json({ message: 'No files uploaded' });
        return;
      }

      const type = MediaTypeSchema.parse(req.query.type || 'product');
      const userId = res.locals.userId;

      const records = await Promise.all(
        req.files.map(file => mediaService.uploadSingle(userId, file, type))
      );

      res.status(201).json(records);
    } catch (error) {
      next(error);
    }
  }

  async deleteFile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = res.locals.userId;

      await mediaService.delete(userId, id);
      res.status(204).send();
    } catch (error: any) {
      if (error.message === 'Media not found') res.status(404).json({ message: error.message });
      else if (error.message === 'Forbidden') res.status(403).json({ message: error.message });
      else next(error);
    }
  }

  async getMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const record = await mediaService.getMetadata(id);
      if (!record) {
        res.status(404).json({ message: 'Media not found' });
        return;
      }
      res.json(record);
    } catch (error) {
      next(error);
    }
  }

  async listUserFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      
      // Basic authorization check - can only view own files unless admin
      if (userId !== res.locals.userId && !res.locals.roles.includes('admin')) {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const records = await mediaService.listUserFiles(userId);
      res.json(records);
    } catch (error) {
      next(error);
    }
  }
}

export const mediaController = new MediaController();
