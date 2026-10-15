import type {OpenRouterModel} from './openrouter/types';
export function zeroPrice(value:unknown){return (typeof value==='string'&&value.trim()!==''||typeof value==='number')&&Number(value)===0;}
export function zeroCostModel(model:OpenRouterModel){const pricing=model.pricing as Record<string,unknown>|undefined;return !!pricing&&zeroPrice(pricing.prompt)&&zeroPrice(pricing.completion)&&Object.values(pricing).every(zeroPrice);}
export function freeChatModel(model:OpenRouterModel){const output=model.architecture?.output_modalities??[];return (model.id==='openrouter/free'||model.id.endsWith(':free'))&&output.length===1&&output[0]==='text'&&zeroCostModel(model);}
export function freeImageModel(model:OpenRouterModel){return model.id.endsWith(':free')&&!!model.architecture?.output_modalities?.includes('image')&&zeroCostModel(model)&&zeroPrice(model.pricing?.image);}
export const FREE_PROVIDER={max_price:{prompt:0,completion:0,request:0,image:0},allow_fallbacks:true};
