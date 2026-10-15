export function colName(n: number): string { let s=""; for(n++;n>0;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }
export function cellValue(key: string, cells: Record<string,string>, chain: string[] = []): string | number {
  if(chain.includes(key) || chain.length>80) return "#CYCLE!";
  const raw=cells[key] ?? "";
  if(!raw.startsWith("=")) return raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  try { return evaluate(raw.slice(1).toUpperCase(),cells,[...chain,key]); } catch(e) { return e instanceof Error && e.message.startsWith("#") ? e.message : "#ERROR!"; }
}
function evaluate(source: string, cells: Record<string,string>, chain: string[]): number {
  const tokens=source.match(/\d*\.?\d+(?:E[+-]?\d+)?|[A-Z]+\d+|[A-Z]+|[()+\-*/,:]/g) ?? [];
  if(tokens.join("")!==source.replace(/\s/g,"")) throw Error("#ERROR!");
  let pos=0;
  function ref(k: string): number {const v=cellValue(k,cells,chain);if(typeof v==="string" && v.startsWith("#"))throw Error(v);if(v==="")return 0;if(!Number.isFinite(Number(v)))throw Error("#VALUE!");return Number(v);}
  function primary(): number {
    const t=tokens[pos++]; if(!t) throw Error("#ERROR!");
    if(t==="-")return -primary();if(t==="+")return primary();
    if(t==="("){const x=expr();if(tokens[pos++]!==")")throw Error("#ERROR!");return x;}
    if(/^\d|^\./.test(t)) return Number(t);
    if(/^[A-Z]+\d+$/.test(t)) return ref(t);
    if(!["SUM","AVERAGE","MIN","MAX","COUNT"].includes(t) || tokens[pos++]!=="(")throw Error("#NAME?");
    const values:number[]=[];
    while(tokens[pos]!==")") {
      if(/^[A-Z]+\d+$/.test(tokens[pos] ?? "") && tokens[pos+1]===":") {
        const start=tokens[pos],end=tokens[pos+2];pos+=3;
        const a=start.match(/^([A-Z]+)(\d+)$/),b=end?.match(/^([A-Z]+)(\d+)$/);if(!a||!b)throw Error("#REF!");
        const cn=(s:string)=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;
        const x1=cn(a[1]),x2=cn(b[1]),y1=+a[2],y2=+b[2];if(x2<x1||y2<y1||(x2-x1+1)*(y2-y1+1)>5000)throw Error("#REF!");
        for(let r=y1;r<=y2;r++)for(let c=x1;c<=x2;c++){const k=colName(c)+r,v=cellValue(k,cells,chain);if(typeof v==="string"&&v.startsWith("#"))throw Error(v);if(v!==""&&Number.isFinite(Number(v)))values.push(Number(v));}
      } else values.push(expr());
      if(tokens[pos]===","){pos++;continue;}if(tokens[pos]!==")")throw Error("#ERROR!");
    }
    pos++;if(t==="SUM")return values.reduce((a,b)=>a+b,0);if(t==="COUNT")return values.length;if(!values.length)throw Error("#DIV/0!");
    if(t==="AVERAGE")return values.reduce((a,b)=>a+b,0)/values.length;if(t==="MIN")return Math.min(...values);return Math.max(...values);
  }
  function term():number {let v=primary();while(["*","/"].includes(tokens[pos])){const t=tokens[pos++],n=primary();if(t==="/"&&n===0)throw Error("#DIV/0!");v=t==="*"?v*n:v/n;}return v;}
  function expr():number {let v=term();while(["+","-"].includes(tokens[pos])){const t=tokens[pos++],n=term();v=t==="+"?v+n:v-n;}return v;}
  const answer=expr();if(pos!==tokens.length||!Number.isFinite(answer))throw Error("#ERROR!");return answer;
}
