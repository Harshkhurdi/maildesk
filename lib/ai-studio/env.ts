
export const OPENROUTER_BASE_URL='https://openrouter.ai/api/v1';
export function hasOpenRouterKey(){return !!process.env.OPENROUTER_API_KEY?.trim();}
export function openRouterHeaders(){const e=process.env;if(!hasOpenRouterKey())throw Error('AI Studio is not configured.');return {'Content-Type':'application/json',Authorization:`Bearer ${(e.OPENROUTER_API_KEY??"").trim()}`,'HTTP-Referer':e.APP_ORIGIN??(e.VERCEL_PROJECT_PRODUCTION_URL?`https://${e.VERCEL_PROJECT_PRODUCTION_URL}`:'http://localhost:5174'),'X-OpenRouter-Title':'Maildesk AI Studio'};}
