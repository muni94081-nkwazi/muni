import asyncHandler from '../utils/asyncHandler.js';
import * as addressService from '../services/address.service.js';

export const list = asyncHandler(async (req, res) => {
  const addresses = await addressService.list(req.user!.id);
  res.status(200).json({ success: true, data: addresses });
});

export const getById = asyncHandler(async (req, res) => {
  const address = await addressService.getById(req.user!.id, req.params.id);
  res.status(200).json({ success: true, data: address });
});

export const create = asyncHandler(async (req, res) => {
  const address = await addressService.create(req.user!.id, req.body);
  res.status(201).json({ success: true, data: address });
});

export const update = asyncHandler(async (req, res) => {
  const address = await addressService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json({ success: true, data: address });
});

export const setDefault = asyncHandler(async (req, res) => {
  const address = await addressService.setDefault(req.user!.id, req.params.id);
  res.status(200).json({ success: true, data: address });
});

export const remove = asyncHandler(async (req, res) => {
  await addressService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});

/** Internal — checkout-service pre-selects the buyer's default shipping target. */
export const getDefaultForUser = asyncHandler(async (req, res) => {
  const address = await addressService.getDefault(req.params.userId);
  res.status(200).json({ success: true, data: address });
});
