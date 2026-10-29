"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, FileText, LayoutGrid, ShieldCheck } from "lucide-react";
import { SuiteNav } from "./suite-nav";
import type { PdfSource } from "./pdf-viewer";
const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => <p className="pdf-loading">Loading PDF tools…</p>,
});
export default function PdfWorkspace() {
  const [source, setSource] = useState<PdfSource | null>(null),
    [dirty, setDirty] = useState(false);
  return (
    <div
      className={`suite-shell office-shell pdf-workspace ${source ? "has-pdf" : "pdf-welcome"}`}
    >
      <header className="office-topbar">
        <Link
          className="office-brand"
          href="/"
          onClick={(event) => {
            if (
              dirty &&
              !window.confirm(
                "Discard unsaved PDF changes? Use Save copy first to keep them.",
              )
            )
              event.preventDefault();
          }}
        >
          <LayoutGrid size={22} />
          <strong>MailDesk</strong>
          <span className="office-brand-divider" />
          <FileText size={19} />
          <span>PDF Studio</span>
        </Link>
        <span className="pdf-workspace-private">
          <ShieldCheck size={15} />
          Private, on-device workspace
        </span>
      </header>
      <aside
        className="suite-sidebar"
        onClickCapture={(event) => {
          if (
            dirty &&
            (event.target as HTMLElement).closest("a") &&
            !window.confirm(
              "Discard unsaved PDF changes? Use Save copy first to keep them.",
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <SuiteNav active="pdf" />
      </aside>
      <main className="suite-main">
        <div className="pdf-workspace-heading">
          <Link
            href="/"
            onClick={(event) => {
              if (
                dirty &&
                !window.confirm(
                  "Discard unsaved PDF changes? Use Save copy first to keep them.",
                )
              )
                event.preventDefault();
            }}
          >
            <ArrowLeft size={16} />
            My workspace
          </Link>
          <span>PDF Studio</span>
        </div>
        <PdfViewer
          source={source}
          onSource={setSource}
          onDirtyChange={setDirty}
        />
      </main>
    </div>
  );
}
