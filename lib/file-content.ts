import {z} from "zod";

const documentContent=z.object({html:z.string().max(500000)});
const slidesContent=z.object({slides:z.array(z.object({title:z.string().max(500),body:z.string().max(20000),notes:z.string().max(10000),color:z.string().regex(/^#[a-fA-F0-9]{6}$/)})).min(1).max(100)});
const sheetContent=z.object({
  cells:z.record(z.string().regex(/^[A-Z][1-9]\d{0,2}$/),z.string().max(5000)),
  rows:z.number().int().min(1).max(500),cols:z.number().int().min(1).max(26),
}).refine(value=>Object.keys(value.cells).every(key=>key.charCodeAt(0)-64<=value.cols&&Number(key.slice(1))<=value.rows));

// The grid and saved content share the same 500 by 26 limit. Reject hidden,
// out-of-grid cells rather than silently saving data the editor cannot show.
export function validateFileContent(kind:string,content:string):string|null{
  if(content.length>1000000)return null;
  let value:unknown;try{value=JSON.parse(content);}catch{return null;}
  const rule=kind==="document"?documentContent:kind==="slides"?slidesContent:kind==="sheet"?sheetContent:null;
  if(!rule)return null;
  const parsed=rule.safeParse(value);return parsed.success?JSON.stringify(parsed.data):null;
}
