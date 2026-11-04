import { Request, Response } from 'express';
import * as service from '../services/fraud.service.js';
import { ScoreRequestSchema } from '../models/fraud.model.js';

export const scoreTransaction = async (req: Request, res: Response) => {
  const data = ScoreRequestSchema.parse(req.body);
  const result = await service.scoreTransaction(data);
  res.json(result);
};

export const reportFraud = async (req: Request, res: Response) => {
  res.json({ message: 'Report received' });
};

export const listCases = async (req: Request, res: Response) => {
  res.json(await service.listCases());
};

export const updateCase = async (req: Request, res: Response) => {
  const { decision } = req.body;
  const result = await service.updateCase(req.params.id, decision);
  res.json(result);
};

export const getStats = async (req: Request, res: Response) => {
  res.json(await service.getStats());
};
