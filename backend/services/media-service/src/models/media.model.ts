import { z } from 'zod';

export const MediaTypeSchema = z.enum(['product', 'avatar', 'document', 'banner']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  type: MediaTypeSchema,
  url: z.string(),
  cdnUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  size: z.number(),
  mimeType: z.string(),
  createdAt: z.string().datetime(),
  thumbnailUrl: z.string().optional(),
});

export type MediaRecord = z.infer<typeof MediaRecordSchema>;
