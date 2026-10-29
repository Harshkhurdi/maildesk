"use client";
import { apps } from "./suite-api";
export function SuiteNav({
  active,
  onSelect,
}: {
  active: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <nav className="suite-nav" aria-label="Applications">
      {apps.map((app) => (
        <a
          key={app.id}
          aria-label={app.name}
          className={active === app.id ? "active" : ""}
          href={app.id === "ai" ? "/ai-studio" : `/?app=${app.id}`}
          onClick={(e) => {
            if (onSelect && app.id !== "ai") {
              e.preventDefault();
              onSelect(app.id);
            }
          }}
        >
          <span className="app-letter" style={{ background: app.color }}>
            {app.letter}
          </span>
          <span>{app.name}</span>
        </a>
      ))}
    </nav>
  );
}
