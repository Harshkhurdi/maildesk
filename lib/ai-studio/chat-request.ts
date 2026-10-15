import {z} from 'zod';
const image=z.object({type:z.literal('image_url'),image_url:z.object({url:z.string().max(1400000).regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/)})});
const pdf=z.object({type:z.literal('file'),file:z.object({filename:z.string().min(1).max(200),file_data:z.string().max(1400000).regex(/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/)})});
const part=z.discriminatedUnion('type',[z.object({type:z.literal('text'),text:z.string().max(100000)}),image,pdf]);
export const chatRequest=z.object({model:z.string().min(1).max(200),messages:z.array(z.object({role:z.enum(['user','assistant','system']),content:z.union([z.string().max(100000),z.array(part).min(1).max(9)])})).min(1).max(100),temperature:z.number().min(0).max(2).optional(),maxTokens:z.number().int().min(16).max(32768).optional(),jsonMode:z.boolean().optional()}).strict();
