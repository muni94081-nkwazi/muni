import type { Request, Response } from 'express';
import * as categoryService from '../services/category.service.js';

export async function getTree(req: Request, res: Response) {
  try {
    const tree = await categoryService.getCategoryTree();
    res.status(200).json({ success: true, data: tree });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getFlat(req: Request, res: Response) {
  try {
    const flat = await categoryService.getCategoriesFlat();
    res.status(200).json({ success: true, data: flat });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getOne(req: Request, res: Response) {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.status(200).json({ success: true, data: category });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function update(req: Request, res: Response) {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    res.status(200).json({ success: true, data: category });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const category = await categoryService.deleteCategory(req.params.id);
    res.status(200).json({ success: true, data: category });
  } catch (error: any) {
    if (error.message.includes('Cannot delete category')) {
      res.status(409).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
