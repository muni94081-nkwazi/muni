import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.status(200).json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body);
  res.status(200).json({ success: true, data: result });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body);
  res.status(200).json({ success: true, message: 'Logged out' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body);
  // Same response whether or not the email exists in the system.
  res.status(200).json({
    success: true,
    message: 'If an account exists for this email, password reset instructions have been sent.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  res.status(200).json({ success: true, message: 'Password has been reset' });
});
