import { z } from 'zod';
export const savedReceiptSchema=z.object({state:z.literal('SAVED'),reviewId:z.uuid(),comparisonId:z.uuid(),savedAt:z.iso.datetime(),identity:z.literal('Shared demo access code — NOT an individually authenticated reviewer')}).strict();
export type SavedReceipt=z.infer<typeof savedReceiptSchema>;
