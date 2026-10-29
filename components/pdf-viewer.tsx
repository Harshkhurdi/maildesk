"use client";
/* PDF.js rendering and form storage are imperative external systems. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  ArrowUpRight,
  X,
  LockKeyhole,
  Maximize2,
  LoaderCircle,
  ShieldCheck,
  TextSelect,
  PanelLeft,
  Printer,
  MousePointer2,
  Highlighter,
  Pencil,
  StickyNote,
  Undo2,
  Redo2,
  MessageSquare,
  Save,
  Trash2,
  MoreHorizontal,
  Check,
  ArrowRight,
} from "lucide-react";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
  TextLayer,
  PageViewport,
} from "pdfjs-dist";
import { download } from "@/lib/exporters";
import { safeUrl } from "@/lib/safe-url";
import { pdfPageText, pdfSearchMatch } from "@/lib/pdf-search";
import {
  pdfBox,
  markedPdfCopy,
  type PdfMarkup,
  type PdfPoint,
} from "@/lib/pdf-markup";
import "@/vendor/pdf-text-layer.css";
export type PdfSource = { blob: Blob; name: string; origin: "local" | "gmail" };
type Hit = { page: number; snippet: string; count: number };
type PdfLink = { url?: string; dest?: unknown; rect: number[] };
type FormField = {
  id: string;
  fieldName?: string;
  fieldType: string;
  rect: number[];
  fieldValue?: string | string[];
  readOnly?: boolean;
  multiLine?: boolean;
  maxLen?: number;
  checkBox?: boolean;
  radioButton?: boolean;
  buttonValue?: string;
  exportValue?: string;
  options?: { displayValue: string; exportValue: string }[];
};
type Outline = {
  title: string;
  dest?: unknown;
  url?: string | null;
  items?: Outline[];
};
type Note = { id: string; rect: number[]; text: string };
const LIMIT = 100 * 1024 * 1024;
function pageRect(view: PageViewport, rect: number[]) {
  const a = view.convertToViewportPoint(rect[0], rect[1]),
    b = view.convertToViewportPoint(rect[2], rect[3]);
  return {
    left: Math.min(a[0], b[0]),
    top: Math.min(a[1], b[1]),
    width: Math.abs(a[0] - b[0]),
    height: Math.abs(a[1] - b[1]),
  };
}
export default function PdfViewer({
  source,
  onSource,
  onDirtyChange,
}: {
  source: PdfSource | null;
  onSource: (source: PdfSource | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [pageDraft, setPageDraft] = useState("1"),
    [zoom, setZoom] = useState(1),
    [fit, setFit] = useState(true),
    [rotation, setRotation] = useState(0),
    [loading, setLoading] = useState(false),
    [rendering, setRendering] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [width, setWidth] = useState(700),
    [view, setView] = useState<PageViewport | null>(null),
    [links, setLinks] = useState<PdfLink[]>([]),
    [fields, setFields] = useState<FormField[]>([]),
    [fieldValues, setFieldValues] = useState<
      Record<string, string | string[] | boolean>
    >({}),
    [existingNotes, setExistingNotes] = useState<Note[]>([]),
    [outline, setOutline] = useState<Outline[]>([]),
    [password, setPassword] = useState(""),
    [needsPassword, setNeedsPassword] = useState(false),
    [wrongPassword, setWrongPassword] = useState(false),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<Hit[]>([]),
    [searching, setSearching] = useState(false),
    [searchProgress, setSearchProgress] = useState(0),
    [panel, setPanel] = useState<"pages" | "outline" | "search" | null>(null),
    [showText, setShowText] = useState(false),
    [showComments, setShowComments] = useState(false),
    [pageText, setPageText] = useState(""),
    [expanded, setExpanded] = useState(false),
    [dragging, setDragging] = useState(false),
    [blobUrl, setBlobUrl] = useState(""),
    [tool, setTool] = useState<"select" | "highlight" | "ink" | "note">(
      "select",
    ),
    [markups, setMarkups] = useState<PdfMarkup[]>([]),
    [redo, setRedo] = useState<PdfMarkup[]>([]),
    [draft, setDraft] = useState<PdfPoint[]>([]),
    [notePoint, setNotePoint] = useState<PdfPoint | null>(null),
    [noteText, setNoteText] = useState(""),
    [dirty, setDirty] = useState(false),
    [exporting, setExporting] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    textLayer = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    pageElement = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    passwordCallback = useRef<((password: string) => void) | null>(null),
    textCache = useRef(new Map<number, string>()),
    actualScale = useRef(1),
    pointer = useRef<PdfPoint[] | null>(null),
    noteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(180, entries[0].contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!source) {
      setBlobUrl("");
      return;
    }
    const url = URL.createObjectURL(source.blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    let active = true,
      task: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setPanel(window.matchMedia("(min-width: 900px)").matches ? "pages" : null);
    setPage(1);
    setZoom(1);
    setFit(true);
    setRotation(0);
    setView(null);
    setError("");
    setPageText("");
    setLinks([]);
    setFields([]);
    setFieldValues({});
    setExistingNotes([]);
    setOutline([]);
    setQuery("");
    setHits([]);
    setNeedsPassword(false);
    setWrongPassword(false);
    setPassword("");
    setMarkups([]);
    setRedo([]);
    setDraft([]);
    setDirty(false);
    setTool("select");
    textCache.current.clear();
    passwordCallback.current = null;
    if (!source) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setProgress(0);
    void (async () => {
      try {
        const lib = await import("pdfjs-dist");
        if (!active) return;
        const base = `/pdfjs/${lib.version}/`;
        lib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
        const bytes = await source.blob.arrayBuffer();
        if (!active) return;
        task = lib.getDocument({
          data: new Uint8Array(bytes),
          cMapUrl: base + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: base + "standard_fonts/",
          wasmUrl: base + "wasm/",
          iccUrl: base + "iccs/",
          enableXfa: false,
          verbosity: 0,
        });
        task.onPassword = (
          update: (password: string) => void,
          reason: number,
        ) => {
          if (!active) return;
          passwordCallback.current = update;
          setNeedsPassword(true);
          setWrongPassword(reason === lib.PasswordResponses.INCORRECT_PASSWORD);
          setLoading(false);
        };
        task.onProgress = ({
          loaded,
          total,
        }: {
          loaded: number;
          total: number;
        }) => {
          if (active && total)
            setProgress(Math.min(100, Math.round((loaded / total) * 100)));
        };
        const document = await task.promise;
        if (!active) return;
        setPdf(document);
        setNeedsPassword(false);
        setLoading(false);
        void document
          .getOutline()
          .then((value) => {
            if (active) setOutline(value ?? []);
          })
          .catch(() => {});
      } catch (e) {
        if (!active) return;
        setLoading(false);
        setNeedsPassword(false);
        setError(
          e instanceof Error && e.name === "InvalidPDFException"
            ? "This PDF is damaged or unsupported. Choose another file."
            : "This PDF could not be opened. Try reopening it or download the original.",
        );
      }
    })();
    return () => {
      active = false;
      passwordCallback.current = null;
      void task?.destroy();
    };
  }, [source]);
  useEffect(() => {
    setPageDraft(String(page));
    stage.current?.scrollTo({ top: 0, left: 0 });
  }, [page]);
  useEffect(() => {
    if (!pdf || !canvas.current || !textLayer.current) return;
    let active = true,
      renderTask: RenderTask | undefined,
      layer: TextLayer | undefined;
    setRendering(true);
    setLinks([]);
    setFields([]);
    setExistingNotes([]);
    textLayer.current.replaceChildren();
    void (async () => {
      try {
        const p = await pdf.getPage(page);
        if (!active) return;
        const angle = (p.rotate + rotation) % 360,
          base = p.getViewport({ scale: 1, rotation: angle }),
          scale = fit ? Math.max(0.1, width / base.width) : zoom;
        actualScale.current = scale;
        const viewport = p.getViewport({ scale, rotation: angle });
        setView(viewport);
        const outputScale = Math.min(
            window.devicePixelRatio || 1,
            2,
            Math.sqrt(12_000_000 / (viewport.width * viewport.height)),
          ),
          c = canvas.current!,
          context = c.getContext("2d", { alpha: false });
        if (!context) throw Error("Canvas unavailable");
        c.width = Math.max(1, Math.floor(viewport.width * outputScale));
        c.height = Math.max(1, Math.floor(viewport.height * outputScale));
        c.style.width = viewport.width + "px";
        c.style.height = viewport.height + "px";
        renderTask = p.render({
          canvas: c,
          canvasContext: context,
          viewport,
          annotationMode: 2,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (!active) return;
        const content = await p.getTextContent();
        if (!active) return;
        const text = pdfPageText(content.items);
        setPageText(text);
        if (textCache.current.size < 1000) textCache.current.set(page, text);
        const lib = await import("pdfjs-dist");
        if (!active) return;
        textLayer.current!.style.setProperty(
          "--total-scale-factor",
          String(scale * (viewport.userUnit || 1)),
        );
        layer = new lib.TextLayer({
          container: textLayer.current!,
          textContentSource: content,
          viewport,
        });
        await layer.render();
        const annotations = await p.getAnnotations({ intent: "display" });
        if (!active) return;
        setLinks(
          annotations.flatMap<PdfLink>((a: PdfLink) => {
            if (!Array.isArray(a.rect)) return [];
            const url = safeUrl(a.url);
            return url
              ? [{ url, rect: a.rect }]
              : a.dest
                ? [{ dest: a.dest, rect: a.rect }]
                : [];
          }),
        );
        setFields(
          annotations.filter(
            (a: FormField) =>
              a.id &&
              Array.isArray(a.rect) &&
              ["Tx", "Ch", "Btn"].includes(a.fieldType) &&
              !a.radioButton,
          ),
        );
        setExistingNotes(
          annotations.flatMap(
            (a: {
              id?: string;
              subtype?: string;
              rect?: number[];
              contentsObj?: { str?: string };
              contents?: string;
            }) =>
              a.subtype === "Text" && Array.isArray(a.rect)
                ? [
                    {
                      id: a.id ?? "",
                      rect: a.rect,
                      text: a.contentsObj?.str ?? a.contents ?? "Comment",
                    },
                  ]
                : [],
          ),
        );
      } catch (e) {
        if (
          active &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setError(
            "This page could not be rendered. Try another page or a smaller zoom.",
          );
      } finally {
        if (active) setRendering(false);
      }
    })();
    return () => {
      active = false;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, fit, zoom, rotation, width]);
  useEffect(() => {
    if (!pdf || !query.trim()) {
      setHits([]);
      setSearching(false);
      setSearchProgress(0);
      return;
    }
    let active = true;
    setSearching(true);
    setHits([]);
    setSearchProgress(0);
    const timer = setTimeout(
      () =>
        void (async () => {
          const result: Hit[] = [];
          try {
            for (let n = 1; n <= pdf.numPages; n++) {
              if (!active) return;
              let text = textCache.current.get(n);
              if (text === undefined) {
                const p = await pdf.getPage(n),
                  content = await p.getTextContent();
                text = pdfPageText(content.items);
                if (active && textCache.current.size < 1000)
                  textCache.current.set(n, text);
              }
              if (!active) return;
              const hit = pdfSearchMatch(text, query);
              if (hit) result.push({ page: n, ...hit });
              if (n % 5 === 0 || n === pdf.numPages) {
                setSearchProgress(n);
                setHits([...result]);
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          } catch {
            if (active)
              setError(
                "Search could not read every page. Results may be incomplete.",
              );
          } finally {
            if (active) setSearching(false);
          }
        })(),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pdf, query]);
  useEffect(() => {
    if (rendering || !textLayer.current) return;
    for (const span of textLayer.current.querySelectorAll("span")) {
      const text = span.textContent ?? "";
      span.replaceChildren();
      const term = query.trim(),
        lower = text.toLocaleLowerCase();
      let start = 0,
        at = term ? lower.indexOf(term.toLocaleLowerCase()) : -1;
      while (at >= 0) {
        span.append(document.createTextNode(text.slice(start, at)));
        const mark = document.createElement("mark");
        mark.className = "pdf-text-match";
        mark.textContent = text.slice(at, at + term.length);
        span.append(mark);
        start = at + term.length;
        at = lower.indexOf(term.toLocaleLowerCase(), start);
      }
      span.append(document.createTextNode(text.slice(start)));
    }
  }, [query, rendering, page]);
  const jump = useCallback(
    (n: number) => {
      if (pdf) setPage(Math.max(1, Math.min(pdf.numPages, Math.trunc(n) || 1)));
    },
    [pdf],
  );
  async function follow(dest: unknown) {
    if (!pdf) return;
    try {
      const values =
        typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(values) || !values.length) return;
      const n =
        typeof values[0] === "number"
          ? values[0]
          : await pdf.getPageIndex(values[0]);
      jump(n + 1);
    } catch {
      setError("This bookmark could not be opened.");
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        setTool("select");
        return;
      }
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setPanel("search");
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        jump(page + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        jump(page - 1);
      }
      if (e.key === "Home") jump(1);
      if (e.key === "End" && pdf) jump(pdf.numPages);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, jump, pdf]);
  useEffect(() => {
    if (notePoint) noteDialog.current?.showModal();
  }, [notePoint]);
  function changeSource(next: PdfSource | null) {
    if (
      dirty &&
      !window.confirm(
        "Discard unsaved PDF changes? Download a marked copy first to keep them.",
      )
    )
      return;
    onSource(next);
  }
  async function open(file: File) {
    if (file.size > LIMIT) {
      setError("Choose a PDF smaller than 100 MB.");
      return;
    }
    if (
      !new TextDecoder("latin1")
        .decode(await file.slice(0, 1024).arrayBuffer())
        .includes("%PDF-")
    ) {
      setError("Choose a readable PDF file.");
      return;
    }
    changeSource({ blob: file, name: file.name, origin: "local" });
  }
  function changeZoom(value: number) {
    setFit(false);
    setZoom(Math.max(0.25, Math.min(4, Math.round(value * 4) / 4)));
  }
  function add(markup: PdfMarkup) {
    if (markups.length >= 1000) {
      setError("Download a copy before adding more than 1,000 markups.");
      return;
    }
    setMarkups((previous) => [...previous, markup]);
    setRedo([]);
    setDirty(true);
  }
  function point(event: React.PointerEvent<SVGSVGElement>): PdfPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return view!.convertToPdfPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
    ) as PdfPoint;
  }
  function begin(event: React.PointerEvent<SVGSVGElement>) {
    if (!view || rendering || event.button !== 0) return;
    const value = point(event);
    if (tool === "note") {
      setNoteText("");
      setNotePoint(value);
      return;
    }
    pointer.current = [value];
    setDraft([value]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!pointer.current || !view) return;
    const value = point(event);
    if (tool === "highlight") pointer.current = [pointer.current[0], value];
    else if (pointer.current.length < 1500) pointer.current.push(value);
    setDraft([...pointer.current]);
  }
  function finish(event: React.PointerEvent<SVGSVGElement>) {
    if (!pointer.current || !view) return;
    const points = [...pointer.current, point(event)];
    pointer.current = null;
    setDraft([]);
    if (tool === "highlight") {
      const box = pdfBox(points[0], points.at(-1)!);
      if (box[2] - box[0] > 1 && box[3] - box[1] > 1)
        add({
          id: crypto.randomUUID(),
          page,
          type: "highlight",
          box,
          color: "#ffdf32",
        });
    } else if (tool === "ink" && points.length > 1)
      add({
        id: crypto.randomUUID(),
        page,
        type: "ink",
        points,
        color: "#185abd",
      });
  }
  function highlightSelection() {
    const selected = window.getSelection();
    if (
      !view ||
      !selected ||
      selected.isCollapsed ||
      !textLayer.current?.contains(selected.anchorNode)
    ) {
      setTool(tool === "highlight" ? "select" : "highlight");
      return;
    }
    const bounds = pageElement.current!.getBoundingClientRect(),
      range = selected.getRangeAt(0);
    for (const rect of range.getClientRects()) {
      const a = view.convertToPdfPoint(
          rect.left - bounds.left,
          rect.top - bounds.top,
        ) as PdfPoint,
        b = view.convertToPdfPoint(
          rect.right - bounds.left,
          rect.bottom - bounds.top,
        ) as PdfPoint;
      add({
        id: crypto.randomUUID(),
        page,
        type: "highlight",
        box: pdfBox(a, b),
        color: "#ffdf32",
      });
    }
    selected.removeAllRanges();
    setTool("select");
  }
  function fieldChange(field: FormField, value: string | string[] | boolean) {
    pdf!.annotationStorage.setValue(field.id, { value });
    setFieldValues((previous) => ({ ...previous, [field.id]: value }));
    setDirty(true);
  }
  async function exportBytes() {
    if (!pdf) throw Error("Open a PDF first.");
    const bytes = await pdf.saveDocument();
    return markups.length
      ? await markedPdfCopy(bytes, markups)
      : Uint8Array.from(bytes);
  }
  async function saveCopy() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const bytes = await exportBytes();
      download(
        new Blob([bytes], { type: "application/pdf" }),
        (source?.name.replace(/\.pdf$/i, "") ?? "document") + "-marked.pdf",
      );
      setDirty(false);
    } catch {
      setError(
        "A marked copy could not be created. Encrypted or signed PDFs may not support these changes. Your original file has not been altered.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function print() {
    if (exporting) return;
    setExporting(true);
    try {
      const bytes = await exportBytes(),
        url = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        ),
        frame = document.createElement("iframe");
      frame.className = "pdf-print-frame";
      frame.src = url;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      document.body.append(frame);
    } catch {
      setError(
        "Printing could not start. Download the PDF or open it in your browser to print.",
      );
    } finally {
      setExporting(false);
    }
  }
  const matches = hits.reduce((sum, hit) => sum + hit.count, 0);
  function markupSvg(markup: PdfMarkup, index: number) {
    if (!view) return null;
    if (markup.type === "highlight") {
      const rect = pageRect(view, markup.box);
      return (
        <rect
          key={markup.id ?? index}
          x={rect.left}
          y={rect.top}
          width={rect.width}
          height={rect.height}
          fill={markup.color}
          opacity=".32"
        />
      );
    }
    if (markup.type === "ink")
      return (
        <polyline
          key={markup.id ?? index}
          points={markup.points
            .map((p) => view.convertToViewportPoint(...p).join(","))
            .join(" ")}
          fill="none"
          stroke={markup.color}
          strokeWidth={1.8 * view.scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    const xy = view.convertToViewportPoint(...markup.point);
    return (
      <g key={markup.id ?? index}>
        <title>{markup.text}</title>
        <rect
          x={xy[0]}
          y={xy[1]}
          width="18"
          height="18"
          rx="3"
          fill="#ffd75e"
          stroke="#bd8a00"
        />
        <text
          x={xy[0] + 9}
          y={xy[1] + 13}
          fontSize="12"
          textAnchor="middle"
          fill="#735600"
        >
          ≡
        </text>
      </g>
    );
  }
  return (
    <section
      className={`pdf-viewer acrobat-viewer ${source ? "is-reading" : "is-welcome"} ${expanded ? "expanded" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <input
        ref={fileInput}
        className="pdf-file-input"
        type="file"
        accept=".pdf,application/pdf"
        aria-label="Choose a PDF file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void open(file);
          event.target.value = "";
        }}
      />
      {source && (
        <>
          <div className="pdf-documentbar">
            <div className="pdf-document-identity">
              <span className="pdf-document-icon">
                <FileText size={23} />
              </span>
              <div>
                <strong title={source.name}>{source.name}</strong>
                <span>
                  <i />
                  {dirty ? "Unsaved changes" : "Private document"}
                  <b>·</b>
                  {pdf ? `${pdf.numPages} pages` : "Opening…"}
                </span>
              </div>
            </div>
            <div className="pdf-document-actions">
              <button
                className="button primary pdf-save"
                aria-label="Download marked PDF"
                disabled={!pdf || exporting}
                onClick={() => void saveCopy()}
              >
                <Download size={16} />
                <span>{exporting ? "Preparing…" : "Save copy"}</span>
              </button>
              <details
                className="pdf-more"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button,a"))
                    event.currentTarget.removeAttribute("open");
                }}
              >
                <summary
                  aria-label="More PDF actions"
                  title="More document actions"
                >
                  <MoreHorizontal size={22} />
                </summary>
                <div className="pdf-action-menu">
                  <button onClick={() => fileInput.current?.click()}>
                    <Upload size={17} />
                    Open another PDF
                  </button>
                  <button
                    aria-label="Download PDF"
                    onClick={() => download(source.blob, source.name)}
                  >
                    <Download size={17} />
                    Download original
                  </button>
                  <button
                    aria-label="Print PDF"
                    disabled={!pdf || exporting}
                    onClick={() => void print()}
                  >
                    <Printer size={17} />
                    Print document
                  </button>
                  {blobUrl && (
                    <a
                      aria-label="Open PDF in browser"
                      href={blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowUpRight size={17} />
                      Open in browser
                    </a>
                  )}
                  <button
                    aria-label={
                      expanded ? "Exit PDF focus view" : "Expand PDF viewer"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    <Maximize2 size={17} />
                    {expanded ? "Exit focus view" : "Focus view"}
                  </button>
                  <button
                    className="pdf-close-action"
                    aria-label="Close PDF"
                    onClick={() => changeSource(null)}
                  >
                    <X size={17} />
                    Close document
                  </button>
                </div>
              </details>
            </div>
          </div>
          <div className="pdf-toolbar">
            <div className="pdf-view-controls">
              <button
                className={`pdf-labeled-tool ${panel === "pages" || panel === "outline" ? "active" : ""}`}
                aria-label="Toggle PDF sidebar"
                aria-expanded={!!panel}
                disabled={!pdf}
                onClick={() => {
                  setPanel(panel ? null : "pages");
                  setShowComments(false);
                  setShowText(false);
                }}
              >
                <PanelLeft size={17} />
                <span>Pages</span>
              </button>
              <button
                className={`pdf-labeled-tool ${panel === "search" ? "active" : ""}`}
                aria-label="Search PDF text"
                disabled={!pdf}
                onClick={() => {
                  setPanel(panel === "search" ? null : "search");
                  setShowComments(false);
                  setShowText(false);
                }}
              >
                <Search size={17} />
                <span>Find</span>
              </button>
              <button
                className="pdf-labeled-tool"
                aria-label="Rotate PDF clockwise"
                title="Rotate view"
                disabled={!pdf}
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw size={17} />
                <span>Rotate</span>
              </button>
              <button
                className="pdf-labeled-tool"
                aria-label="Show PDF page text"
                aria-pressed={showText}
                disabled={!pdf}
                onClick={() => {
                  setShowText(!showText);
                  setShowComments(false);
                  setPanel(null);
                }}
              >
                <TextSelect size={17} />
                <span>Text</span>
              </button>
            </div>
            <div className="pdf-page-navigation">
              <button
                className="pdf-tool"
                aria-label="Previous PDF page"
                disabled={!pdf || page <= 1}
                onClick={() => jump(page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <form
                className="pdf-page-control"
                onSubmit={(event) => {
                  event.preventDefault();
                  jump(Number(pageDraft));
                }}
              >
                <input
                  aria-label="PDF page number"
                  type="number"
                  min={1}
                  max={pdf?.numPages ?? 1}
                  value={pageDraft}
                  disabled={!pdf}
                  onChange={(event) => setPageDraft(event.target.value)}
                  onBlur={() => {
                    jump(Number(pageDraft));
                    setPageDraft(
                      String(
                        Math.max(
                          1,
                          Math.min(pdf?.numPages ?? 1, Number(pageDraft) || 1),
                        ),
                      ),
                    );
                  }}
                />
                <span>/ {pdf?.numPages ?? "…"}</span>
              </form>
              <button
                className="pdf-tool"
                aria-label="Next PDF page"
                disabled={!pdf || page >= pdf.numPages}
                onClick={() => jump(page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="pdf-zoom-controls">
              <button
                className="pdf-tool"
                aria-label="Zoom PDF out"
                disabled={!pdf}
                onClick={() =>
                  changeZoom((fit ? actualScale.current : zoom) - 0.25)
                }
              >
                <ZoomOut size={17} />
              </button>
              <select
                className="pdf-zoom"
                aria-label="PDF zoom"
                disabled={!pdf}
                value={fit ? "fit" : String(zoom)}
                onChange={(event) =>
                  event.target.value === "fit"
                    ? setFit(true)
                    : changeZoom(Number(event.target.value))
                }
              >
                <option value="fit">Fit width</option>
                {Array.from({ length: 16 }, (_, i) => (i + 1) / 4).map((n) => (
                  <option key={n} value={n}>
                    {Math.round(n * 100)}%
                  </option>
                ))}
              </select>
              <button
                className="pdf-tool"
                aria-label="Zoom PDF in"
                disabled={!pdf}
                onClick={() =>
                  changeZoom((fit ? actualScale.current : zoom) + 0.25)
                }
              >
                <ZoomIn size={17} />
              </button>
            </div>
          </div>
        </>
      )}
      {error && (
        <div className="pdf-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss PDF error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className={`pdf-reader ${source ? "has-document" : ""}`}>
        {source && pdf && panel && (
          <aside className="pdf-navigation">
            <div className="pdf-panel-header">
              <strong>Document navigation</strong>
              <button
                className="pdf-tool"
                aria-label="Close PDF sidebar"
                onClick={() => setPanel(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="pdf-panel-tabs">
              <button
                className={panel === "pages" ? "active" : ""}
                onClick={() => setPanel("pages")}
              >
                Pages
              </button>
              <button
                className={panel === "outline" ? "active" : ""}
                onClick={() => setPanel("outline")}
              >
                Bookmarks
              </button>
              <button
                className={panel === "search" ? "active" : ""}
                onClick={() => setPanel("search")}
              >
                Find
              </button>
            </div>
            <div className="pdf-navigation-body">
              {panel === "pages" ? (
                Array.from({ length: pdf.numPages }, (_, i) => (
                  <PdfThumbnail
                    key={i}
                    pdf={pdf}
                    number={i + 1}
                    selected={page === i + 1}
                    onClick={() => jump(i + 1)}
                  />
                ))
              ) : panel === "outline" ? (
                outline.length ? (
                  <PdfOutline
                    items={outline}
                    onFollow={(dest) => void follow(dest)}
                  />
                ) : (
                  <p className="pdf-panel-note">This PDF has no bookmarks.</p>
                )
              ) : (
                <>
                  <label className="pdf-search-input">
                    <Search size={15} />
                    <input
                      placeholder="Find text…"
                      aria-label="Search within PDF"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      maxLength={200}
                    />
                  </label>
                  <p className="pdf-search-summary" role="status">
                    {searching
                      ? `Searching ${searchProgress} of ${pdf.numPages} pages…`
                      : query.trim()
                        ? `${matches} ${matches === 1 ? "match" : "matches"} on ${hits.length} ${hits.length === 1 ? "page" : "pages"}`
                        : "Search text across all pages."}
                  </p>
                  {hits.map((hit) => (
                    <button
                      key={hit.page}
                      className={`pdf-search-result ${page === hit.page ? "active" : ""}`}
                      onClick={() => jump(hit.page)}
                    >
                      <span>
                        Page {hit.page} · {hit.count}{" "}
                        {hit.count === 1 ? "match" : "matches"}
                      </span>
                      <p>{hit.snippet}</p>
                    </button>
                  ))}
                  {!searching && query.trim() && !hits.length && (
                    <p className="pdf-panel-note">
                      No matching text. Scanned pages need OCR, which is not
                      included.
                    </p>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
        <div
          ref={stage}
          className={`pdf-stage ${dragging ? "dragging" : ""}`}
          aria-label="PDF viewing area"
        >
          {!source ? (
            <div className="pdf-empty">
              <div className="pdf-welcome-main">
                <div className="pdf-welcome-copy">
                  <span className="pdf-welcome-kicker">
                    <span />
                    YOUR PERSONAL PDF STUDIO
                  </span>
                  <h1>
                    Your documents.
                    <br />
                    <em>A clearer view.</em>
                  </h1>
                  <p>
                    Read, annotate and fill PDFs in one focused workspace. A
                    little less clutter. A lot more clarity.
                  </p>
                  <button
                    className="button primary pdf-open-primary"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={18} />
                    Open a PDF
                    <ArrowRight size={17} />
                  </button>
                  <span className="pdf-drop-hint">
                    or drop a file here · up to 100 MB
                  </span>
                  <span className="pdf-private">
                    <ShieldCheck size={15} />
                    Your files stay on your device.
                  </span>
                </div>
                <div className="pdf-welcome-art" aria-hidden="true">
                  <div className="pdf-art-orbit" />
                  <div className="pdf-art-paper">
                    <div className="pdf-art-paper-top">
                      <span className="pdf-art-brand">
                        M<span>—</span>
                      </span>
                      <span>WORKING DOCUMENT / 01</span>
                    </div>
                    <span className="pdf-art-eyebrow">A NEW PERSPECTIVE</span>
                    <h2>
                      Good ideas.
                      <br />
                      Clearly expressed.
                    </h2>
                    <p className="pdf-art-intro">
                      Make every page a little more meaningful.
                    </p>
                    <div className="pdf-art-lines">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="pdf-art-chart">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="pdf-art-bottom">
                      <span>PROJECT OVERVIEW</span>
                      <span>01 / 08</span>
                    </div>
                  </div>
                  <div className="pdf-art-note">
                    <span>
                      <Check size={13} />
                    </span>
                    <div>
                      <strong>One final touch.</strong>
                      <p>Ready for the next chapter.</p>
                    </div>
                  </div>
                  <div className="pdf-art-tool">
                    <Highlighter size={20} />
                    <Pencil size={20} />
                    <StickyNote size={20} />
                  </div>
                  <span className="pdf-art-label">PDF</span>
                </div>
              </div>
              <div className="pdf-welcome-features">
                <div>
                  <span>
                    <Search size={20} />
                  </span>
                  <div>
                    <h2>Read & navigate</h2>
                    <p>
                      Find a phrase. Jump to a page. See the bigger picture.
                    </p>
                  </div>
                </div>
                <div>
                  <span>
                    <Highlighter size={20} />
                  </span>
                  <div>
                    <h2>Mark up & review</h2>
                    <p>Highlight the details. Draw freely. Leave a note.</p>
                  </div>
                </div>
                <div>
                  <span>
                    <Save size={20} />
                  </span>
                  <div>
                    <h2>Fill & take it with you</h2>
                    <p>Complete forms and download a copy with your changes.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : needsPassword ? (
            <form
              className="pdf-password"
              onSubmit={(event) => {
                event.preventDefault();
                if (!password) return;
                setLoading(true);
                setNeedsPassword(false);
                passwordCallback.current?.(password);
                setPassword("");
              }}
            >
              <LockKeyhole size={32} />
              <h2>This PDF needs a password.</h2>
              <p>
                {wrongPassword
                  ? "That password did not unlock this file."
                  : "The password is used only in your browser."}
              </p>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="off"
                  required
                  aria-label="PDF password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="button primary">Unlock PDF</button>
            </form>
          ) : loading ? (
            <div className="pdf-loading" role="status">
              <LoaderCircle className="spinning" size={27} />
              <p>Opening PDF… {progress ? progress + "%" : ""}</p>
            </div>
          ) : pdf ? (
            <div
              ref={pageElement}
              className="pdf-page"
              style={{ width: view?.width, height: view?.height }}
            >
              <canvas
                ref={canvas}
                role="img"
                aria-label={`PDF page ${page} of ${pdf.numPages}`}
              />
              <div ref={textLayer} className="textLayer" />
              {view &&
                links.map((link, i) =>
                  link.url ? (
                    <a
                      className="pdf-page-link"
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open link: ${link.url}`}
                      style={pageRect(view, link.rect)}
                    />
                  ) : (
                    <button
                      className="pdf-page-link"
                      key={i}
                      title="Go to linked page"
                      aria-label="Go to linked PDF page"
                      style={pageRect(view, link.rect)}
                      onClick={() => void follow(link.dest)}
                    />
                  ),
                )}
              {view &&
                fields.map((field) => {
                  const common = {
                    style: pageRect(view, field.rect),
                    "aria-label": field.fieldName || "PDF form field",
                    disabled: field.readOnly || tool !== "select",
                    className: "pdf-form-field",
                  };
                  const value = fieldValues[field.id] ?? field.fieldValue ?? "";
                  return field.fieldType === "Tx" ? (
                    field.multiLine ? (
                      <textarea
                        key={field.id}
                        {...common}
                        value={String(value)}
                        maxLength={field.maxLen || undefined}
                        onChange={(event) =>
                          fieldChange(field, event.target.value)
                        }
                      />
                    ) : (
                      <input
                        key={field.id}
                        {...common}
                        type="text"
                        value={String(value)}
                        maxLength={field.maxLen || undefined}
                        onChange={(event) =>
                          fieldChange(field, event.target.value)
                        }
                      />
                    )
                  ) : field.fieldType === "Btn" && field.checkBox ? (
                    <input
                      key={field.id}
                      {...common}
                      type="checkbox"
                      checked={
                        typeof value === "boolean"
                          ? value
                          : !!value && value !== "Off"
                      }
                      onChange={(event) =>
                        fieldChange(field, event.target.checked)
                      }
                    />
                  ) : field.fieldType === "Ch" ? (
                    <select
                      key={field.id}
                      {...common}
                      value={Array.isArray(value) ? value[0] : String(value)}
                      onChange={(event) =>
                        fieldChange(field, [event.target.value])
                      }
                    >
                      {field.options?.map((option) => (
                        <option
                          key={option.exportValue}
                          value={option.exportValue}
                        >
                          {option.displayValue}
                        </option>
                      ))}
                    </select>
                  ) : null;
                })}
              {view &&
                existingNotes.map((note) => (
                  <span
                    key={note.id}
                    className="pdf-existing-note"
                    title={note.text}
                    aria-label={`PDF comment: ${note.text}`}
                    style={{
                      left: pageRect(view, note.rect).left,
                      top: pageRect(view, note.rect).top,
                    }}
                  >
                    <StickyNote size={17} />
                  </span>
                ))}
              {view && (
                <svg
                  className="pdf-markup-layer"
                  data-tool={tool}
                  aria-label="PDF markup layer"
                  width={view.width}
                  height={view.height}
                  style={{ pointerEvents: tool === "select" ? "none" : "auto" }}
                  onPointerDown={begin}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onPointerCancel={() => {
                    pointer.current = null;
                    setDraft([]);
                  }}
                >
                  {markups.filter((item) => item.page === page).map(markupSvg)}
                  {draft.length > 1 &&
                    markupSvg(
                      tool === "highlight"
                        ? {
                            id: "draft",
                            page,
                            type: "highlight",
                            box: pdfBox(draft[0], draft.at(-1)!),
                            color: "#ffdf32",
                          }
                        : {
                            id: "draft",
                            page,
                            type: "ink",
                            points: draft,
                            color: "#185abd",
                          },
                      -1,
                    )}
                </svg>
              )}
              {rendering && (
                <div className="pdf-rendering" role="status">
                  <LoaderCircle className="spinning" size={14} />
                  Rendering page…
                </div>
              )}
            </div>
          ) : (
            <div className="pdf-loading">
              <FileText size={30} />
              <p>Choose another PDF or download this original.</p>
            </div>
          )}
          {dragging && (
            <div className="pdf-drop-overlay">
              <Upload size={32} />
              <strong>Drop a PDF to open it</strong>
            </div>
          )}
        </div>
        {source && pdf && (
          <aside className="pdf-tool-rail" aria-label="PDF tools">
            <button
              className={tool === "select" ? "active" : ""}
              title="Select text and fill forms"
              aria-label="Select PDF text"
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={20} />
              <span>Select</span>
            </button>
            <button
              className={tool === "highlight" ? "active" : ""}
              title="Highlight selected text or drag an area"
              aria-label="Highlight PDF"
              onMouseDown={(event) => event.preventDefault()}
              onClick={highlightSelection}
            >
              <Highlighter size={20} />
              <span>Highlight</span>
            </button>
            <button
              className={tool === "ink" ? "active" : ""}
              title="Draw on the page"
              aria-label="Draw on PDF"
              onClick={() => setTool(tool === "ink" ? "select" : "ink")}
            >
              <Pencil size={20} />
              <span>Draw</span>
            </button>
            <button
              className={tool === "note" ? "active" : ""}
              title="Add a sticky note"
              aria-label="Add PDF note"
              onClick={() => setTool(tool === "note" ? "select" : "note")}
            >
              <StickyNote size={20} />
              <span>Note</span>
            </button>
            <span />
            <button
              aria-label="Undo PDF markup"
              title="Undo markup"
              disabled={!markups.length}
              onClick={() => {
                setRedo((previous) => [...previous, markups.at(-1)!]);
                setMarkups((previous) => previous.slice(0, -1));
                setDirty(true);
              }}
            >
              <Undo2 size={19} />
            </button>
            <button
              aria-label="Redo PDF markup"
              title="Redo markup"
              disabled={!redo.length}
              onClick={() => {
                setMarkups((previous) => [...previous, redo.at(-1)!]);
                setRedo((previous) => previous.slice(0, -1));
                setDirty(true);
              }}
            >
              <Redo2 size={19} />
            </button>
            <span />
            <button
              aria-label="Show PDF comments"
              title="Comments and markups"
              className={showComments ? "active" : ""}
              onClick={() => {
                setShowComments(!showComments);
                setShowText(false);
                if (window.matchMedia("(max-width: 760px)").matches)
                  setPanel(null);
              }}
            >
              <MessageSquare size={20} />
              <span>Notes</span>
            </button>
          </aside>
        )}
        {source && showText && (
          <aside className="pdf-text-panel">
            <div className="pdf-search-heading">
              <strong>Page {page} text</strong>
              <button
                aria-label="Close page text"
                onClick={() => setShowText(false)}
              >
                <X size={15} />
              </button>
            </div>
            <p>
              {pageText.trim() ||
                "No selectable text. Scanned images need OCR."}
            </p>
          </aside>
        )}
        {source && showComments && (
          <aside className="pdf-comments-panel">
            <div className="pdf-search-heading">
              <strong>Comments & markups</strong>
              <button
                aria-label="Close PDF comments"
                onClick={() => setShowComments(false)}
              >
                <X size={15} />
              </button>
            </div>
            {!markups.length && !existingNotes.length && (
              <p className="pdf-panel-note">
                Use the tools to highlight, draw or add a note.
              </p>
            )}
            {markups.map((item) => (
              <div className="pdf-comment" key={item.id}>
                <button onClick={() => jump(item.page)}>
                  <span>
                    Page {item.page} ·{" "}
                    {item.type === "ink"
                      ? "Drawing"
                      : item.type === "highlight"
                        ? "Highlight"
                        : "Note"}
                  </span>
                  <p>{item.type === "note" ? item.text : "Local markup"}</p>
                </button>
                <button
                  aria-label="Remove PDF markup"
                  onClick={() => {
                    setMarkups((previous) =>
                      previous.filter((value) => value.id !== item.id),
                    );
                    setRedo([]);
                    setDirty(true);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {existingNotes.map((item) => (
              <div className="pdf-comment" key={item.id}>
                <p>{item.text}</p>
              </div>
            ))}
          </aside>
        )}
      </div>
      <div className="pdf-footer">
        <span>
          <ShieldCheck size={13} />
          {source?.origin === "gmail"
            ? "Gmail attachment · opened on demand"
            : "Local PDF · stays on this device"}
        </span>
        <span>
          {tool !== "select"
            ? `${tool === "ink" ? "Draw" : tool === "highlight" ? "Highlight" : "Note"} tool · Escape to select text`
            : dirty
              ? "Unsaved changes · use Save copy"
              : pdf
                ? `${pdf.numPages} pages · ${source ? formatSize(source.blob.size) : ""}`
                : "No upload required"}
        </span>
      </div>
      {notePoint && (
        <dialog
          ref={noteDialog}
          className="suite-dialog pdf-note-dialog"
          aria-label="Add PDF note"
          onCancel={(event) => {
            event.preventDefault();
            setNotePoint(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteText.trim()) return;
              add({
                id: crypto.randomUUID(),
                page,
                type: "note",
                point: notePoint,
                text: noteText.trim(),
                color: "#ffd75e",
              });
              setNotePoint(null);
              setTool("select");
              setShowComments(true);
              if (window.matchMedia("(max-width: 760px)").matches)
                setPanel(null);
            }}
          >
            <h2>Add a note</h2>
            <label>
              Note text
              <textarea
                aria-label="PDF note text"
                value={noteText}
                maxLength={1000}
                required
                onChange={(event) => setNoteText(event.target.value)}
              />
            </label>
            <footer>
              <button
                type="button"
                className="suite-button"
                onClick={() => setNotePoint(null)}
              >
                Cancel
              </button>
              <button className="suite-button primary">Add note</button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
function PdfThumbnail({
  pdf,
  number,
  selected,
  onClick,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  selected: boolean;
  onClick: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!button.current) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { rootMargin: "160px" },
    );
    observer.observe(button.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    let active = true,
      task: RenderTask | undefined;
    void (async () => {
      try {
        const page = await pdf.getPage(number);
        if (!active || !canvas.current) return;
        const viewport = page.getViewport({
            scale: 110 / page.getViewport({ scale: 1 }).width,
          }),
          c = canvas.current;
        c.width = Math.ceil(viewport.width);
        c.height = Math.ceil(viewport.height);
        const ctx = c.getContext("2d", { alpha: false });
        if (!ctx) return;
        task = page.render({ canvas: c, canvasContext: ctx, viewport });
        await task.promise;
      } catch {}
    })();
    return () => {
      active = false;
      task?.cancel();
    };
  }, [pdf, number, visible]);
  return (
    <button
      ref={button}
      className={`pdf-thumbnail ${selected ? "active" : ""}`}
      aria-label={`Go to page ${number}`}
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
    >
      {visible ? (
        <canvas ref={canvas} />
      ) : (
        <div className="pdf-thumbnail-placeholder" />
      )}
      <span>{number}</span>
    </button>
  );
}
function PdfOutline({
  items,
  onFollow,
  depth = 0,
}: {
  items: Outline[];
  onFollow: (destination: unknown) => void;
  depth?: number;
}) {
  if (depth > 20) return null;
  return (
    <ul className="pdf-outline">
      {items.slice(0, 1000).map((item, index) => (
        <li key={index}>
          {safeUrl(item.url) ? (
            <a
              href={safeUrl(item.url)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.title}
            </a>
          ) : (
            <button onClick={() => onFollow(item.dest)}>{item.title}</button>
          )}
          {item.items?.length ? (
            <PdfOutline
              items={item.items}
              onFollow={onFollow}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
function formatSize(size: number) {
  return size >= 1024 * 1024
    ? (size / 1024 / 1024).toFixed(1) + " MB"
    : Math.ceil(size / 1024) + " KB";
}
