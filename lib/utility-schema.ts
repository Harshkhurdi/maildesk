import {z} from "zod";
import {merchantUrl,publicWebUrl} from "./web-links";
const file=z.object({name:z.string().regex(/^[a-zA-Z0-9_ .-]{1,80}$/),content:z.string().max(850000)});
const code=z.object({files:z.array(file).min(1).max(30).refine(a=>new Set(a.map(f=>f.name)).size===a.length)});
const web=z.object({url:z.string().max(2500).refine(s=>!!publicWebUrl(s))});
const quote=z.object({id:z.string().uuid(),product:z.string().trim().min(1).max(200),merchant:z.enum(["blinkit","swiggy","zepto","flipkart","amazon"]),url:z.string().max(2000),pack:z.string().min(1).max(80),price:z.number().finite().positive().max(10000000),delivery:z.number().finite().min(0).max(100000),quantity:z.number().int().min(1).max(100),checkedAt:z.string().datetime(),location:z.string().regex(/^([1-9]\d{5})?$/)}).refine(q=>!!merchantUrl(q.url,q.merchant));
const shopping=z.object({address:z.string().max(600),pincode:z.string().regex(/^([1-9]\d{5})?$/),quotes:z.array(quote).max(50)});
export function validateUtility(kind:string,content:string){try{const data=JSON.parse(content),s=kind==="code"?code:kind==="shopping"?shopping:web;const p=s.safeParse(data);return p.success?JSON.stringify(p.data):null;}catch{return null;}}
