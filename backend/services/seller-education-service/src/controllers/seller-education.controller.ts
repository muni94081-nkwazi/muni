import type { Request, Response } from 'express';
import { sellerEducationService } from '../services/seller-education.service.js';

export async function getCourses(_req: Request, res: Response): Promise<void> {
  try {
    const courses = await sellerEducationService.getCourses();
    res.json({ success: true, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getCourseById(req: Request, res: Response): Promise<void> {
  try {
    const course = await sellerEducationService.getCourseById(req.params.id);
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getOnboardingProgress(req: Request, res: Response): Promise<void> {
  const sellerId = req.params.sellerId || (req.headers['x-user-id'] as string) || 'seller-001';
  try {
    const progress = await sellerEducationService.getOnboardingProgress(sellerId);
    res.json({ success: true, data: progress });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function recordProgress(req: Request, res: Response): Promise<void> {
  const sellerId = (req.headers['x-user-id'] as string) || req.body.sellerId || 'seller-001';
  const { stepId, courseId } = req.body;

  try {
    const progress = await sellerEducationService.recordProgress(sellerId, stepId, courseId);
    res.json({ success: true, data: progress, message: 'Progress recorded' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getWebinars(_req: Request, res: Response): Promise<void> {
  try {
    const webinars = await sellerEducationService.getWebinars();
    res.json({ success: true, data: webinars });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function registerForWebinar(req: Request, res: Response): Promise<void> {
  const sellerId = (req.headers['x-user-id'] as string) || req.body.sellerId || 'seller-001';
  try {
    const webinar = await sellerEducationService.registerForWebinar(req.params.id, sellerId);
    if (!webinar) {
      res.status(404).json({ success: false, message: 'Webinar not found' });
      return;
    }
    res.json({ success: true, data: webinar, message: 'Successfully registered for seller webinar' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
