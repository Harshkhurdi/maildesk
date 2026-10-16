import JSZip from "jszip";
import {readOfficeArchive} from "./office-archive.ts";
import {readXlsx} from "./xlsx-import.ts";
import {parseCsv} from "./csv.ts";
import {colName} from "./sheet.ts";
import {validateFileContent} from "./file-content.ts";
import type {FileKind,FileContent,Slide} from "./types";
export type OfficeImport={title:string;kind:FileKind;content:FileContent;warnings:string[]};
export const officeAccept={document:".docx,.txt,.html,.htm",slides:".pptx",sheet:".xlsx,.csv"};
const escape=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const elements=(root:Document|Element,name:string)=>Array.from(root.getElementsByTagNameNS("*",name));
function xml(text:string){
  if(text.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error("This file contains unsupported XML. Nothing has been imported.");
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(elements(doc,"parsererror").length)throw Error("This presentation is damaged. Save a new PPTX copy and try again.");
  return doc;
}
function paragraphText(root:Element){
  let text="";
  function visit(node:Element){if(node.localName==="t")text+=node.textContent??"";else if(node.localName==="br")text+="\n";else if(node.localName==="tab")text+="\t";else for(const child of Array.from(node.childNodes))if(child.nodeType===1)visit(child as Element);}
  visit(root);return text;
}
function shapeText(root:Element){return elements(root,"p").map(paragraphText).join("\n");}
function resolvePart(from:string,target:string){
  if(!target||/^[a-z]+:/i.test(target)||target.includes('\\')||target.includes('?')||target.includes('#'))throw Error("The presentation contains an unsupported part reference.");
  const parts=target.startsWith('/')?[]:from.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='..'){if(!parts.length)throw Error("Invalid presentation part reference.");parts.pop();}else if(part&&part!=='.')parts.push(part);}
  return parts.join('/');
}
async function part(zip:JSZip,name:string,required=true){const file=zip.file(name);if(!file){if(required)throw Error("This Office file is incomplete. Save a new copy and try again.");return null;}const text=await file.async("string");return xml(text);}
function relationships(doc:Document|null){return new Map(doc?elements(doc,"Relationship").filter(el=>el.getAttribute("TargetMode")!=="External").map(el=>[el.getAttribute("Id")!,{target:el.getAttribute("Target")!,type:el.getAttribute("Type")??""}]):[]);}
async function readSlides(bytes:ArrayBuffer){
  const zip=await readOfficeArchive(bytes),deck=(await part(zip,"ppt/presentation.xml"))!,rels=relationships(await part(zip,"ppt/_rels/presentation.xml.rels"));
  const ids=elements(deck,"sldId");if(!ids.length||ids.length>100)throw Error("Open a presentation containing between 1 and 100 slides.");
  const slides:Slide[]=[],warnings=["Slide text and speaker notes open as an editable copy. Images, charts, animations, and original layouts are not reproduced. Keep your original PPTX file."];
  for(const id of ids){
    const rel=rels.get(id.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")??id.getAttribute("r:id")??"");
    if(!rel||!rel.type.endsWith('/slide'))throw Error("A slide reference is missing. Nothing has been imported.");
    const path=resolvePart("ppt/presentation.xml",rel.target),doc=(await part(zip,path))!,shapes=elements(doc,"sp").map(el=>({el,text:shapeText(el)})).filter(item=>item.text.trim());
    const titleShape=shapes.find(({el})=>elements(el,"ph").some(ph=>["title","ctrTitle"].includes(ph.getAttribute("type")??"")))??[...shapes].sort((a,b)=>Math.max(0,...elements(b.el,"rPr").map(p=>Number(p.getAttribute("sz"))||0))-Math.max(0,...elements(a.el,"rPr").map(p=>Number(p.getAttribute("sz"))||0)))[0];
    const title=titleShape?.text??`Slide ${slides.length+1}`,body=shapes.filter(item=>item!==titleShape).map(item=>item.text);
    for(const table of elements(doc,"tbl"))body.push(elements(table,"tr").map(row=>elements(row,"tc").map(shapeText).join("\t")).join("\n"));
    const slideRels=relationships(await part(zip,path.replace(/([^/]+)$/,"_rels/$1.rels"),false)),notesRel=[...slideRels.values()].find(rel=>rel.type.endsWith('/notesSlide'));
    let notes="";
    if(notesRel){const noteDoc=(await part(zip,resolvePart(path,notesRel.target)))!;notes=elements(noteDoc,"sp").filter(el=>!elements(el,"ph").some(ph=>["sldNum","hdr","ftr","dt"].includes(ph.getAttribute("type")??""))).map(shapeText).filter(Boolean).join("\n");}
    const background=elements(doc,"bg")[0],color=background?elements(background,"srgbClr")[0]?.getAttribute("val"):null;
    slides.push({title,body:body.join("\n\n"),notes,color:color&&/^[\da-f]{6}$/i.test(color)?'#'+color:"#1d5145"});
  }
  return {content:{slides},warnings};
}
export async function readOfficeFile(file:File,kind:FileKind):Promise<OfficeImport>{
  const extension=file.name.split('.').pop()?.toLowerCase()??"";
  if(!officeAccept[kind].split(',').includes('.'+extension))throw Error(`Choose ${officeAccept[kind].replaceAll(',',', ')}. For older Office files, save a DOCX, PPTX, or XLSX copy first.`);
  const max=extension==='xlsx'||extension==='csv'?1_000_000:['txt','html','htm'].includes(extension)?500_000:5_000_000;
  if(file.size>max)throw Error(`Choose a file smaller than ${max/1_000_000} MB.`);
  let content:FileContent,warnings:string[]=[];
  if(extension==='docx'){
    const bytes=await file.arrayBuffer(),zip=await readOfficeArchive(bytes),doc=(await part(zip,"word/document.xml"))!;
    if(elements(doc,"altChunk").length)throw Error("This document contains embedded content that cannot be opened here. Save a standard DOCX copy first.");
    function inline(node:Element):string{
      if(["del","instrText","drawing","pict"].includes(node.localName))return "";
      if(node.localName==="t")return escape(node.textContent??"");
      if(node.localName==="tab")return "&#9;";
      if(["br","cr"].includes(node.localName))return "<br>";
      let value=Array.from(node.childNodes).filter(child=>child.nodeType===1).map(child=>inline(child as Element)).join("");
      if(node.localName==="r"){
        const properties=elements(node,"rPr")[0];
        const enabled=(name:string)=>{const el=properties?elements(properties,name)[0]:null;return !!el&&!["0","false","off","none"].includes(el.getAttribute("w:val")??"");};
        if(enabled("b"))value=`<strong>${value}</strong>`;if(enabled("i"))value=`<em>${value}</em>`;if(enabled("u"))value=`<u>${value}</u>`;
      }
      return value;
    }
    function blocks(root:Element):string{
      return Array.from(root.childNodes).filter(node=>node.nodeType===1).map(node=>{
        const el=node as Element;
        if(el.localName==="p"){
          const style=elements(el,"pStyle")[0]?.getAttribute("w:val")??"",heading=/^heading([123])$/i.exec(style),tag=heading?'h'+heading[1]:'p';
          const alignment=elements(el,"jc")[0]?.getAttribute("w:val"),align=alignment&&["left","center","right"].includes(alignment)?` style="text-align:${alignment}"`:"";
          return `<${tag}${align}>${elements(el,"numPr").length?'• ':''}${inline(el)||'<br>'}</${tag}>`;
        }
        if(el.localName==="tbl")return '<table>'+Array.from(el.childNodes).filter(n=>n.nodeType===1&&(n as Element).localName==='tr').map(row=>'<tr>'+Array.from(row.childNodes).filter(n=>n.nodeType===1&&(n as Element).localName==='tc').map(cell=>'<td>'+blocks(cell as Element)+'</td>').join('')+'</tr>').join('')+'</table>';
        if(["sdt","sdtContent","customXml"].includes(el.localName))return blocks(el);
        return "";
      }).join('');
    }
    const body=elements(doc,"body")[0];if(!body)throw Error("The Word document has no readable body.");
    content={html:blocks(body)};warnings=["Text, headings, basic formatting, list text, and tables open as an editable copy. Images, exact page layouts, headers, footnotes, and tracked deletions are not reproduced. Keep your original DOCX file."];
  }else if(extension==='pptx')({content,warnings}=await readSlides(await file.arrayBuffer()));
  else if(kind==='sheet'){
    const table=extension==='xlsx'?await readXlsx(await file.arrayBuffer()):parseCsv(await file.text());
    if(table.length>500||table.some(row=>row.length>26))throw Error("Use at most 500 rows and 26 columns. Nothing has been imported.");
    const cells:Record<string,string>={};table.forEach((row,r)=>row.forEach((value,c)=>{if(value)cells[colName(c)+(r+1)]=value;}));
    content={cells,rows:Math.max(24,table.length),cols:Math.max(12,...table.map(row=>row.length))};
    warnings=["Only the first worksheet opens. Values and formulas are imported; charts, macros, and original formatting are not. Supported formulas: SUM, AVERAGE, MIN, MAX, COUNT, and arithmetic."];
  }else{const text=await file.text();content={html:extension==='txt'?text.split(/\r?\n/).map(line=>`<p>${escape(line)||'<br>'}</p>`).join(''):text};}
  if(!validateFileContent(kind,JSON.stringify(content)))throw Error("This file exceeds the editor's text or cell limits. Nothing has been imported.");
  return {kind,title:file.name.replace(/\.[^.]+$/,'').slice(0,200)||"Opened file",content,warnings};
}
