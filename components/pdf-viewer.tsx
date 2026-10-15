"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { FileText,Upload,ZoomIn,ZoomOut,RotateCw,ChevronLeft,ChevronRight,Search,Download,ArrowUpRight,X,LockKeyhole,Maximize2,LoaderCircle,ShieldCheck,BookOpen,TextSelect } from "lucide-react";
import type { PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask,TextLayer } from "pdfjs-dist";
import { download } from "@/lib/exporters";
import { safeUrl } from "@/lib/task-rules";
import "@/vendor/pdf-text-layer.css";
export type PdfSource={blob:Blob;name:string;origin:"local"|"gmail"};
const LIMIT=100*1024*1024;
type Hit={page:number;snippet:string;count:number};
type PageLink={url:string;left:number;top:number;width:number;height:number};
export default function PdfViewer({source,onSource}:{source:PdfSource|null;onSource:(s:PdfSource|null)=>void}){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[pageDraft,setPageDraft]=useState("1"),[zoom,setZoom]=useState(1),[fit,setFit]=useState(true),[rotation,setRotation]=useState(0),[loading,setLoading]=useState(false),[rendering,setRendering]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState(0),[width,setWidth]=useState(700),[dimensions,setDimensions]=useState({width:0,height:0}),[links,setLinks]=useState<PageLink[]>([]),[password,setPassword]=useState(""),[needsPassword,setNeedsPassword]=useState(false),[wrongPassword,setWrongPassword]=useState(false),[query,setQuery]=useState(""),[hits,setHits]=useState<Hit[]>([]),[searchProgress,setSearchProgress]=useState(0),[searching,setSearching]=useState(false),[showSearch,setShowSearch]=useState(false),[showText,setShowText]=useState(false),[pageText,setPageText]=useState(""),[expanded,setExpanded]=useState(false),[dragging,setDragging]=useState(false),[blobUrl,setBlobUrl]=useState("");
  const canvas=useRef<HTMLCanvasElement>(null),textLayer=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),passwordCallback=useRef<((s:string)=>void)|null>(null),textCache=useRef(new Map<number,string>()),actualScale=useRef(1);
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(200,entries[0].contentRect.width-48)));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!source){setBlobUrl("");return;}const url=URL.createObjectURL(source.blob);setBlobUrl(url);return()=>URL.revokeObjectURL(url);},[source]);
  useEffect(()=>{
    let active=true,task:PDFDocumentLoadingTask|undefined;
    setPdf(null);setPage(1);setZoom(1);setFit(true);setRotation(0);setError("");setPageText("");setLinks([]);setQuery("");setHits([]);setNeedsPassword(false);setWrongPassword(false);setPassword("");textCache.current.clear();passwordCallback.current=null;
    if(!source){setLoading(false);return;}
    setLoading(true);setProgress(0);
    void (async()=>{try{
      const lib=await import("pdfjs-dist");if(!active)return;
      const base=`/pdfjs/${lib.version}/`;
      lib.GlobalWorkerOptions.workerSrc=base+"pdf.worker.min.mjs";
      const buffer=await source.blob.arrayBuffer();if(!active)return;
      task=lib.getDocument({data:new Uint8Array(buffer),cMapUrl:base+"cmaps/",cMapPacked:true,standardFontDataUrl:base+"standard_fonts/",wasmUrl:base+"wasm/",iccUrl:base+"iccs/",enableXfa:false,verbosity:0});
      task.onPassword=(update:(p:string)=>void,reason:number)=>{if(!active)return;passwordCallback.current=update;setNeedsPassword(true);setWrongPassword(reason===lib.PasswordResponses.INCORRECT_PASSWORD);setLoading(false);};
      task.onProgress=({loaded,total}:{loaded:number;total:number})=>{if(active&&total)setProgress(Math.min(100,Math.round(loaded/total*100)));};
      const loaded=await task.promise;if(!active)return;setPdf(loaded);setNeedsPassword(false);setLoading(false);
    }catch(e){if(!active)return;setLoading(false);setNeedsPassword(false);setError(e instanceof Error&&e.name==="InvalidPDFException"?"This file is not a readable PDF, or it is damaged. Try the original file or open it in your browser.":"This PDF could not be opened here. Try reopening it, or use Open in browser / Download below.");}})();
    return()=>{active=false;passwordCallback.current=null;void task?.destroy();};
  },[source]);
  useEffect(()=>{setPageDraft(String(page));viewport.current?.scrollTo({top:0,left:0});},[page]);
  useEffect(()=>{
    if(!pdf||!canvas.current||!textLayer.current)return;
    let active=true,renderTask:RenderTask|undefined,layer:TextLayer|undefined;
    setRendering(true);setError("");setLinks([]);textLayer.current.replaceChildren();
    void (async()=>{try{
      const p=await pdf.getPage(page);if(!active)return;
      const angle=(p.rotate+rotation)%360,base=p.getViewport({scale:1,rotation:angle});
      const scale=fit?Math.max(.2,width/base.width):zoom;
      actualScale.current=scale;
      const view=p.getViewport({scale,rotation:angle});
      setDimensions({width:view.width,height:view.height});
      const outputScale=Math.min(window.devicePixelRatio||1,2,Math.sqrt(12000000/(view.width*view.height)));
      const c=canvas.current!,context=c.getContext("2d",{alpha:false});if(!context)throw Error("Canvas unavailable");
      c.width=Math.max(1,Math.floor(view.width*outputScale));c.height=Math.max(1,Math.floor(view.height*outputScale));
      c.style.width=view.width+"px";c.style.height=view.height+"px";
      renderTask=p.render({canvas:c,canvasContext:context,viewport:view,transform:outputScale===1?undefined:[outputScale,0,0,outputScale,0,0]});
      await renderTask.promise;if(!active)return;
      const content=await p.getTextContent();if(!active)return;
      const text=content.items.map(item=>"str" in item?item.str+(item.hasEOL?"\n":" "):"").join("");setPageText(text);textCache.current.set(page,text);
      const lib=await import("pdfjs-dist");if(!active)return;
      textLayer.current!.style.setProperty("--total-scale-factor",String(scale*(view.userUnit||1)));
      layer=new lib.TextLayer({container:textLayer.current!,textContentSource:content,viewport:view});
      await layer.render();
      const annotations=await p.getAnnotations({intent:"display"});if(!active)return;
      setLinks(annotations.flatMap((a:any)=>{const url=safeUrl(a.url);if(!url||!Array.isArray(a.rect))return [];const [x1,y1]=view.convertToViewportPoint(a.rect[0],a.rect[1]),[x2,y2]=view.convertToViewportPoint(a.rect[2],a.rect[3]);return [{url,left:Math.min(x1,x2),top:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)}];}));
    }catch(e){if(active&&!(e instanceof Error&&e.name==="RenderingCancelledException"))setError("This page could not be rendered. Try another page, reduce the zoom, or open the PDF in your browser.");}finally{if(active)setRendering(false);}})();
    return()=>{active=false;renderTask?.cancel();layer?.cancel();};
  },[pdf,page,fit,zoom,rotation,width]);
  useEffect(()=>{
    if(!pdf||!query.trim()){setHits([]);setSearching(false);setSearchProgress(0);return;}
    let active=true;const term=query.trim().toLocaleLowerCase();setSearching(true);setHits([]);setSearchProgress(0);
    const timer=setTimeout(()=>void(async()=>{const result:Hit[]=[];try{for(let n=1;n<=pdf.numPages;n++){
      if(!active)return;let text=textCache.current.get(n);if(text===undefined){const p=await pdf.getPage(n);const c=await p.getTextContent();text=c.items.map(item=>"str" in item?item.str+" ":"").join("");if(active&&textCache.current.size<1000)textCache.current.set(n,text);}
      if(!active)return;const lower=text.toLocaleLowerCase(),at=lower.indexOf(term);if(at>=0){let count=0,pos=0;while((pos=lower.indexOf(term,pos))>=0){count++;pos+=term.length;}result.push({page:n,count,snippet:(at>45?"…":"")+text.slice(Math.max(0,at-45),at+term.length+100)+(at+term.length+100<text.length?"…":"")});}
      setSearchProgress(n);setHits([...result]);if(n%10===0)await new Promise(r=>setTimeout(r,0));
    }}catch{if(active)setError("Search could not read every page. Results may be incomplete.");}finally{if(active)setSearching(false);}})(),300);
    return()=>{active=false;clearTimeout(timer);};
  },[pdf,query]);
  const jump=useCallback((n:number)=>{if(pdf)setPage(Math.max(1,Math.min(pdf.numPages,Math.trunc(n)||1)));},[pdf]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==="Escape"){setExpanded(false);return;}const target=e.target as HTMLElement;if(["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable)return;if((e.ctrlKey||e.metaKey)&&e.key==="f"){e.preventDefault();setShowSearch(true);return;}if(e.key==="ArrowRight"||e.key==="PageDown"){e.preventDefault();jump(page+1);}if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();jump(page-1);}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[page,jump]);
  async function open(file:File){if(file.size>LIMIT){setError("Please use a PDF smaller than 100 MB. For a larger file, use your browser’s PDF viewer.");return;}const prefix=new Uint8Array(await file.slice(0,1024).arrayBuffer());if(!new TextDecoder("latin1").decode(prefix).includes("%PDF-")){setError("Please choose a PDF file. This file does not contain a PDF header.");return;}onSource({blob:file,name:file.name,origin:"local"});}
  function changeZoom(next:number){setFit(false);setZoom(Math.max(.25,Math.min(3,Math.round(next*4)/4)));}
  return <section className={`pdf-viewer ${expanded?"expanded":""}`} onDragOver={e=>{e.preventDefault();if(e.dataTransfer.types.includes("Files"))setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)void open(f);}}>
    <input ref={fileInput} className="pdf-file-input" type="file" accept=".pdf,application/pdf" aria-label="Choose a PDF file" onChange={e=>{const f=e.target.files?.[0];if(f)void open(f);e.target.value="";}}/>
    <div className="pdf-toolbar"><button className="button primary small" onClick={()=>fileInput.current?.click()}><Upload size={14}/>{source?"Open another PDF":"Open PDF"}</button>{source&&<><span className="pdf-filename" title={source.name}>{source.name}</span><span className="pdf-toolbar-divider"/><button className="pdf-tool" title="Previous page" aria-label="Previous PDF page" disabled={!pdf||page<=1} onClick={()=>jump(page-1)}><ChevronLeft size={17}/></button><form className="pdf-page-control" onSubmit={e=>{e.preventDefault();jump(Number(pageDraft));setPageDraft(String(Math.max(1,Math.min(pdf?.numPages??1,Number(pageDraft)||1))));}}><input aria-label="PDF page number" type="number" min={1} max={pdf?.numPages??1} value={pageDraft} disabled={!pdf} onChange={e=>setPageDraft(e.target.value)} onBlur={()=>{const n=Math.max(1,Math.min(pdf?.numPages??1,Math.trunc(Number(pageDraft))||1));jump(n);setPageDraft(String(n));}}/><span>of {pdf?.numPages??"…"}</span></form><button className="pdf-tool" title="Next page" aria-label="Next PDF page" disabled={!pdf||page>=pdf.numPages} onClick={()=>jump(page+1)}><ChevronRight size={17}/></button><span className="pdf-toolbar-divider"/><button className="pdf-tool" title="Zoom out" aria-label="Zoom PDF out" disabled={!pdf} onClick={()=>changeZoom((fit?actualScale.current:zoom)-.25)}><ZoomOut size={16}/></button><select className="pdf-zoom" aria-label="PDF zoom" disabled={!pdf} value={fit?"fit":String(zoom)} onChange={e=>e.target.value==="fit"?setFit(true):changeZoom(Number(e.target.value))}><option value="fit">Fit width</option>{[.25,.5,.75,1,1.25,1.5,2,2.5,3].map(n=><option value={n} key={n}>{Math.round(n*100)}%</option>)}</select><button className="pdf-tool" title="Zoom in" aria-label="Zoom PDF in" disabled={!pdf} onClick={()=>changeZoom((fit?actualScale.current:zoom)+.25)}><ZoomIn size={16}/></button><button className="pdf-tool" title="Rotate clockwise" aria-label="Rotate PDF clockwise" disabled={!pdf} onClick={()=>setRotation(r=>(r+90)%360)}><RotateCw size={15}/></button><button className={`pdf-tool ${showSearch?"active":""}`} title="Find text" aria-label="Search PDF text" disabled={!pdf} onClick={()=>setShowSearch(s=>!s)}><Search size={16}/></button><button className={`pdf-tool ${showText?"active":""}`} title="Read page text" aria-label="Show PDF page text" disabled={!pdf} onClick={()=>setShowText(s=>!s)}><TextSelect size={16}/></button><button className={`pdf-tool ${expanded?"active":""}`} title={expanded?"Exit focus view":"Focus view"} aria-label={expanded?"Exit PDF focus view":"Expand PDF viewer"} onClick={()=>setExpanded(v=>!v)}><Maximize2 size={16}/></button><span className="pdf-toolbar-spacer"/><button className="pdf-tool" title="Download original" aria-label="Download PDF" onClick={()=>download(source.blob,source.name)}><Download size={16}/></button>{blobUrl&&<a className="pdf-tool" title="Open in browser" aria-label="Open PDF in browser" href={blobUrl} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={17}/></a>}<button className="pdf-tool" title="Close PDF" aria-label="Close PDF" onClick={()=>{setExpanded(false);onSource(null);}}><X size={17}/></button></>}</div>
    {error&&<div className="pdf-error" role="alert"><span>{error}</span><button aria-label="Dismiss PDF error" onClick={()=>setError("")}><X size={14}/></button></div>}
    <div className={`pdf-reader ${source?"has-document":""}`}>
      {source&&showSearch&&<aside className="pdf-search-panel"><div className="pdf-search-heading"><strong>Find in document</strong><button aria-label="Close PDF search" onClick={()=>setShowSearch(false)}><X size={15}/></button></div><label className="pdf-search-input"><Search size={15}/><input autoFocus placeholder="Search this PDF…" aria-label="Search within PDF" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/></label><p className="pdf-search-summary" role="status">{searching?`Searching page ${searchProgress} of ${pdf?.numPages}…`:query.trim()?`${hits.reduce((n,h)=>n+h.count,0)} ${hits.reduce((n,h)=>n+h.count,0)===1?"match":"matches"} on ${hits.length} ${hits.length===1?"page":"pages"}`:"Search selectable text across all pages."}</p>{hits.map(hit=><button key={hit.page} className={`pdf-search-result ${page===hit.page?"active":""}`} onClick={()=>jump(hit.page)}><span>Page {hit.page} · {hit.count} {hit.count===1?"match":"matches"}</span><p>{hit.snippet}</p></button>)}{!searching&&query.trim()&&!hits.length&&<p className="pdf-search-note">No matching text found. Scanned images may need OCR before they can be searched.</p>}</aside>}
      <div ref={viewport} className={`pdf-stage ${dragging?"dragging":""}`} aria-label="PDF viewing area">
      {!source?<div className="pdf-empty"><span className="pdf-empty-icon"><FileText size={37} strokeWidth={1.2}/></span><p className="eyebrow">A CLOSER LOOK, WITHOUT LEAVING YOUR DESK</p><h2>A place for every PDF.</h2><p>Drop a PDF here, or choose one from your device.<br/>Read, search, rotate, and zoom at your own pace.</p><button className="button primary" onClick={()=>fileInput.current?.click()}><Upload size={15}/>Choose a PDF</button><span className="pdf-private"><ShieldCheck size={13}/>Local files stay on your device · up to 100 MB</span></div>:needsPassword?<form className="pdf-password" onSubmit={e=>{e.preventDefault();if(!password)return;setLoading(true);setNeedsPassword(false);passwordCallback.current?.(password);setPassword("");}}><LockKeyhole size={31} strokeWidth={1.4}/><h2>This PDF is password protected.</h2><p>{wrongPassword?"That password didn’t unlock the file. Please try again.":"Enter its password to read it. The password stays in your browser."}</p><label>Password<input type="password" autoComplete="off" autoFocus required aria-label="PDF password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button primary" type="submit">Unlock PDF</button></form>:loading?<div className="pdf-loading" role="status"><LoaderCircle size={26} className="spinning"/><p>Opening your PDF… {progress?`${progress}%`:""}</p></div>:pdf?<><div className="pdf-page" style={{width:dimensions.width||undefined,height:dimensions.height||undefined}}><canvas ref={canvas} aria-label={`PDF page ${page} of ${pdf.numPages}`} role="img"/><div ref={textLayer} className="textLayer"/>{links.map((link,i)=><a className="pdf-page-link" key={i} href={link.url} target="_blank" rel="noopener noreferrer" title={link.url} aria-label={`Open link: ${link.url}`} style={{left:link.left,top:link.top,width:link.width,height:link.height}}/>)}{rendering&&<div className="pdf-rendering" role="status"><LoaderCircle size={14} className="spinning"/>Rendering page…</div>}</div></>:<div className="pdf-loading"><FileText size={30}/><p>Choose another file, or use Open in browser / Download.</p></div>}
      {dragging&&<div className="pdf-drop-overlay"><Upload size={30}/><strong>Drop to open your PDF</strong></div>}</div>
      {source&&showText&&<aside className="pdf-text-panel"><div className="pdf-search-heading"><strong>Page {page} text</strong><button aria-label="Close page text" onClick={()=>setShowText(false)}><X size={15}/></button></div><p>{pageText.trim()||"No selectable text on this page. The page may be a scanned image; OCR is not enabled."}</p></aside>}
    </div><div className="pdf-footer"><span><ShieldCheck size={12}/>{source?.origin==="gmail"?"Gmail attachment · opened on demand":"Local PDFs stay on your device"}</span><span>{pdf?`${pdf.numPages} pages · ${source?formatSize(source.blob.size):""} · ${rotation?`rotated ${rotation}°`:(fit?"fit width":`${Math.round(zoom*100)}%`)}`:"PDF viewer · no external AI"}</span></div>
  </section>;
}
function formatSize(n:number){return n>=1024*1024?(n/1024/1024).toFixed(1)+" MB":Math.ceil(n/1024)+" KB";}
