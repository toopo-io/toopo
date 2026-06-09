import { z } from 'zod';
import { ErrorCode } from './codes.js';

export { ErrorCode };

const InterpolationValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const ErrorResponseSchema = z.object({
  code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
  message: z.string().min(1),
  params: z.record(z.string(), InterpolationValueSchema).optional(),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
