import type { FileContent, WorkspaceFile } from "./types";
import type { IParagraphOptions, INumberingOptions } from "docx";
import { createSheetCalculator,colName } from "./sheet";
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportFile(file:WorkspaceFile,content:FileContent){
  const name=file.title.replace(/[/\\:*?"<>|]/g,"-");
  if(file.kind==="document"){
    const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,LevelFormat}=await import("docx");
    const dom=new DOMParser().parseFromString(content.html??"","text/html");
    function runs(node:Node,style:{bold?:boolean;italics?:boolean;underline?:{}}={}):InstanceType<typeof TextRun>[] {
      if(node.nodeType===Node.TEXT_NODE)return [new TextRun({...style,text:node.textContent??""})];
      const tag=(node as Element).tagName;const next={...style,bold:style.bold||["B","STRONG"].includes(tag),italics:style.italics||["I","EM"].includes(tag),underline:style.underline||(["U"].includes(tag)?{}:undefined)};
      if(tag==="BR")return [new TextRun({break:1})];return [...node.childNodes].flatMap(n=>runs(n,next));
    }
    const children: InstanceType<typeof Paragraph>[] = [];
    const numbering: INumberingOptions["config"][number][] = [];
    type ParagraphStyle = Pick<IParagraphOptions,"heading"|"alignment"|"bullet"|"numbering">;
    function collect(nodes: Node[], style: ParagraphStyle = {}, depth = 0) {
      let inline: InstanceType<typeof TextRun>[] = [];
      function flush(force = false) {
        if (inline.length || force) children.push(new Paragraph({...style,children:inline,spacing:{after:180}}));
        inline = [];
      }
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && !inline.length) continue;
        if (node.nodeType !== Node.ELEMENT_NODE) { inline.push(...runs(node)); continue; }
        const el = node as HTMLElement, tag = el.tagName;
        if (tag === "UL" || tag === "OL") {
          flush();
          const level = Math.min(depth,8), reference = `maildesk-list-${numbering.length}`;
          if (tag === "OL") numbering.push({reference,levels:Array.from({length:9},(_,n)=>({level:n,format:LevelFormat.DECIMAL,text:`%${n+1}.`,alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720*(n+1),hanging:360}}}}))});
          for (const li of [...el.children].filter(child=>child.tagName==="LI")) {
            collect([...li.childNodes], {...style,bullet:tag==="UL"?{level}:undefined,numbering:tag==="OL"?{reference,level}:undefined},depth+1);
          }
        } else if (["H1","H2","H3","P","DIV","LI","BLOCKQUOTE","TD","TH","TABLE","TBODY","THEAD","TR"].includes(tag)) {
          flush();
          const alignment = el.style.textAlign==="center"?AlignmentType.CENTER:el.style.textAlign==="right"?AlignmentType.RIGHT:el.style.textAlign==="left"?AlignmentType.LEFT:style.alignment;
          const heading = tag==="H1"?HeadingLevel.HEADING_1:tag==="H2"?HeadingLevel.HEADING_2:tag==="H3"?HeadingLevel.HEADING_3:style.heading;
          collect([...el.childNodes], {...style,alignment,heading},depth);
          if (!el.childNodes.length) flush(true);
        } else inline.push(...runs(node));
      }
      flush();
    }
    collect([...dom.body.childNodes]);
    if (!children.length) children.push(new Paragraph({children:[]}));
    download(await Packer.toBlob(new Document({numbering:{config:numbering},sections:[{children}]})),name+".docx");
  }else if(file.kind==="slides"){
    const {default:PptxGenJS}=await import("pptxgenjs");const deck=new PptxGenJS();deck.layout="LAYOUT_WIDE";deck.title=file.title;deck.author="Maildesk";
    for(const item of content.slides??[]){const slide=deck.addSlide();slide.background={color:item.color.slice(1)};slide.addText("MAILDESK / PRESENTATION",{x:0.7,y:0.5,w:10,h:0.25,fontFace:"Aptos",fontSize:10,color:"FFFFFF",transparency:30});slide.addText(item.title,{x:0.7,y:1.35,w:11.8,h:2.2,fontFace:"Aptos Display",fontSize:34,bold:true,color:"FFFFFF",breakLine:false,fit:"shrink",valign:"middle"});slide.addText(item.body,{x:0.75,y:3.9,w:11.5,h:2.1,fontFace:"Aptos",fontSize:20,color:"FFFFFF",fit:"shrink",valign:"top"});slide.addNotes(item.notes);}
    await deck.writeFile({fileName:name+".pptx"});
  }else{
    const {default:ExcelJS}=await import("exceljs");const book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Sheet 1");const cells=content.cells??{},calculate=createSheetCalculator(cells);
    for(const [key,raw] of Object.entries(cells)){if(raw.startsWith("=")){const result=calculate(key);sheet.getCell(key).value={formula:raw.slice(1),result:typeof result==="number"?result:undefined};}else sheet.getCell(key).value=raw!==""&&Number.isFinite(Number(raw))?Number(raw):raw;}
    for(let c=0;c<(content.cols??12);c++)sheet.getColumn(colName(c)).width=20;sheet.getRow(1).font={bold:true,color:{argb:"FF1D5145"}};sheet.views=[{state:"frozen",ySplit:1}];
    const data=await book.xlsx.writeBuffer();download(new Blob([data as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),name+".xlsx");
  }
}
