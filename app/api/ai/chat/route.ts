import {guard,body,failure,HttpError} from '@/lib/server';
import {catalog} from '@/lib/ai-studio/catalog';
import {hasOpenRouterKey,openRouterHeaders,OPENROUTER_BASE_URL} from '@/lib/ai-studio/env';
import {freeChatModel,FREE_PROVIDER} from '@/lib/ai-studio/free-policy';
import {chatRequest} from '@/lib/ai-studio/chat-request';
export async function POST(req:Request){try{
 await guard(req);const result=chatRequest.safeParse(await body(req));if(!result.success)throw new HttpError(400,'Check the model, message, settings, and attachment sizes. Only prompts and selected attachments are accepted.');const p=result.data;
 if(p.model!=='openrouter/free'&&!p.model.endsWith(':free'))throw new HttpError(400,'Paid models and paid variants are blocked. Choose a verified free model.');
 let models;try{models=await catalog();}catch(e){throw new HttpError(502,(e as Error).message);}const model=models.find(m=>m.id===p.model&&freeChatModel(m));if(!model)throw new HttpError(400,'This model is not currently verified as free. Refresh the model list.');
 const hasImages=p.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url'));if(hasImages&&!model.architecture?.input_modalities?.includes('image'))throw new HttpError(400,'This model does not support images. Select a vision model.');
 if(!hasOpenRouterKey())throw new HttpError(503,'AI Studio needs an OpenRouter key in the site’s server settings.');
 const hasPdf=p.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='file'));
 const upstream=await fetch(`${OPENROUTER_BASE_URL}/chat/completions`,{method:'POST',headers:openRouterHeaders(),signal:AbortSignal.any([req.signal,AbortSignal.timeout(120000)]),body:JSON.stringify({model:p.model,messages:p.messages,stream:true,stream_options:{include_usage:true},provider:FREE_PROVIDER,...(hasPdf?{plugins:[{id:'file-parser',pdf:{engine:'cloudflare-ai'}}]}:{}),...(p.jsonMode?{response_format:{type:'json_object'}}:{}),temperature:p.temperature??0.7,max_tokens:p.maxTokens??4096})});
 if(!upstream.ok||!upstream.body){
 let reason='';try{const detail=await upstream.json() as {error?:{message?:string;metadata?:{limit_source?:string}}};reason=String(detail.error?.message??'').slice(0,1000)+' '+String(detail.error?.metadata?.limit_source??'');}catch{}
 const limit=/free-models-per-day|daily/i.test(reason)?'The OpenRouter daily free-request limit was reached. Try again after the quota resets.':/free-models-per-min|per.minute/i.test(reason)?'OpenRouter’s free-request limit per minute was reached. Wait a minute, then retry.':/ip.address|IP rate|cloudflare|edge|IP limit/i.test(reason)?'OpenRouter is limiting requests from this hosting network. Retry later.':/upstream|provider|shared.pool/i.test(reason)?'The model provider’s free pool is busy. Try another free model or retry later.':'The free model is rate-limited. Retry later or choose another free model.';
 throw new HttpError(upstream.status===429?429:502,upstream.status===429?limit:upstream.status===401?'The configured OpenRouter key was rejected. Update it in the site’s server settings.':`The AI provider could not complete this request (${upstream.status}). Try another free model.`);
 }
 return new Response(upstream.body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'}});
 }catch(e){return failure(e);}}
