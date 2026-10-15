import {guard,json,failure,HttpError} from '@/lib/server';
import {chatModels} from '@/lib/ai-studio/catalog';
import {hasOpenRouterKey} from '@/lib/ai-studio/env';
export async function GET(){try{await guard();try{return json({models:await chatModels(),configured:hasOpenRouterKey()});}catch(e){throw new HttpError(502,(e as Error).message);}}catch(e){return failure(e);}}
