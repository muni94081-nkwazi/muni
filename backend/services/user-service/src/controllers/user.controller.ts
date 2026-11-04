import asyncHandler from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';

export const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user!.id);
  res.status(200).json({ success: true, data: user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user!.id, req.body);
  res.status(200).json({ success: true, data: user });
});

export const getMyPreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.getPreferences(req.user!.id);
  res.status(200).json({ success: true, data: preferences });
});

export const updateMyPreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.updatePreferences(req.user!.id, req.body);
  res.status(200).json({ success: true, data: preferences });
});

/**
 * Internal — notification-service resolves a recipient's channels here
 * before every send. Trusted-network-only, consistent with the other
 * service-to-service endpoints on this platform.
 */
export const getContactProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getContactProfile(req.params.userId);
  res.status(200).json({ success: true, data: profile });
});
