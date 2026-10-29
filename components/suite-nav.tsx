"use client";
import { FileText } from "lucide-react";
import { AppIcon } from "./office-brand";
import { apps } from "./suite-api";
export function SuiteNav({
  active,
  onSelect,
}: {
  active: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      <nav className="suite-nav" aria-label="Applications">
        {apps.map((app) => (
          <a
            key={app.id}
            aria-label={app.name}
            aria-current={active === app.id ? "page" : undefined}
            title={app.name}
            className={active === app.id ? "active" : ""}
            href={app.id === "ai" ? "/ai-studio" : `/?app=${app.id}`}
            onClick={(e) => {
              if (onSelect && app.id !== "ai") {
                e.preventDefault();
                onSelect(app.id);
              }
            }}
          >
            <AppIcon kind={app.id} size={30} />
            <span>{app.name}</span>
          </a>
        ))}
      </nav>
      <nav className="suite-nav" aria-label="PDF tools">
        <a
          href="/pdf"
          title="PDF reader and markup"
          aria-label="PDF reader"
          aria-current={active === "pdf" ? "page" : undefined}
          className={active === "pdf" ? "active pdf-nav-link" : "pdf-nav-link"}
        >
          <FileText size={27} />
          <span>PDF</span>
        </a>
      </nav>
    </>
  );
}
