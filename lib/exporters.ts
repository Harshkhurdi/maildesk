import type { FileContent, WorkspaceFile } from "./types";
import { cellValue,colName } from "./sheet";
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportFile(file:WorkspaceFile,content:FileContent){
  const name=file.title.replace(/[/\\:*?"<>|]/g,"-");
  if(file.kind==="document"){
    const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType}=await import("docx");
    const dom=new DOMParser().parseFromString(content.html??"","text/html");
    function runs(node:Node,style:{bold?:boolean;italics?:boolean;underline?:{}}={}):InstanceType<typeof TextRun>[] {
      if(node.nodeType===Node.TEXT_NODE)return [new TextRun({...style,text:node.textContent??""})];
      const tag=(node as Element).tagName;const next={...style,bold:style.bold||["B","STRONG"].includes(tag),italics:style.italics||["I","EM"].includes(tag),underline:style.underline||(["U"].includes(tag)?{}:undefined)};
      if(tag==="BR")return [new TextRun({break:1})];return [...node.childNodes].flatMap(n=>runs(n,next));
    }
    const blocks=[...dom.body.querySelectorAll("h1,h2,h3,p,li,blockquote,td,div")].filter(el=>!el.querySelector("h1,h2,h3,p,li,blockquote,td,div"))
    /* leaf blocks prevent duplicated text in nested rich-text markup */
    ;
    const children=blocks.length?blocks.map(el=>new Paragraph({children:runs(el),alignment:(el as HTMLElement).style.textAlign==="center"?AlignmentType.CENTER:(el as HTMLElement).style.textAlign==="right"?AlignmentType.RIGHT:AlignmentType.LEFT,heading:el.tagName==="H1"?HeadingLevel.HEADING_1:el.tagName==="H2"?HeadingLevel.HEADING_2:el.tagName==="H3"?HeadingLevel.HEADING_3:undefined,bullet:el.tagName==="LI"?{level:0}:undefined,spacing:{after:180}})):[new Paragraph({children:[new TextRun(dom.body.textContent??"")]})];
    download(await Packer.toBlob(new Document({sections:[{children}]})),name+".docx");
  }else if(file.kind==="slides"){
    const {default:PptxGenJS}=await import("pptxgenjs");const deck=new PptxGenJS();deck.layout="LAYOUT_WIDE";deck.title=file.title;deck.author="Maildesk";
    for(const item of content.slides??[]){const slide=deck.addSlide();slide.background={color:item.color.slice(1)};slide.addText("MAILDESK / PRESENTATION",{x:0.7,y:0.5,w:10,h:0.25,fontFace:"Aptos",fontSize:10,color:"FFFFFF",transparency:30});slide.addText(item.title,{x:0.7,y:1.35,w:11.8,h:2.2,fontFace:"Aptos Display",fontSize:34,bold:true,color:"FFFFFF",breakLine:false,fit:"shrink",valign:"middle"});slide.addText(item.body,{x:0.75,y:3.9,w:11.5,h:2.1,fontFace:"Aptos",fontSize:20,color:"FFFFFF",fit:"shrink",valign:"top"});slide.addNotes(item.notes);}
    await deck.writeFile({fileName:name+".pptx"});
  }else{
    const ExcelJS=await import("exceljs");const book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Sheet 1");const cells=content.cells??{};
    for(const [key,raw] of Object.entries(cells)){if(raw.startsWith("=")){const result=cellValue(key,cells);sheet.getCell(key).value={formula:raw.slice(1),result:typeof result==="number"?result:undefined};}else sheet.getCell(key).value=raw!==""&&Number.isFinite(Number(raw))?Number(raw):raw;}
    for(let c=0;c<(content.cols??12);c++)sheet.getColumn(colName(c)).width=20;sheet.getRow(1).font={bold:true,color:{argb:"FF1D5145"}};sheet.views=[{state:"frozen",ySplit:1}];
    const data=await book.xlsx.writeBuffer();download(new Blob([data as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),name+".xlsx");
  }
}
