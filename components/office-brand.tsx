import type { CSSProperties } from "react";
import { FileText, Table2, Presentation, Mail, Sparkles } from "lucide-react";
export function AppIcon({ kind, size = 32 }: { kind: string; size?: number }) {
  const app = {
    document: {
      letter: "W",
      color: "#185abd",
      back: "#41a5ee",
      Icon: FileText,
    },
    sheet: { letter: "X", color: "#107c41", back: "#33c481", Icon: Table2 },
    slides: {
      letter: "P",
      color: "#c43e1c",
      back: "#ed906e",
      Icon: Presentation,
    },
    outlook: { letter: "O", color: "#0078d4", back: "#50c8ef", Icon: Mail },
    ai: { letter: "✦", color: "#6554c0", back: "#a599ea", Icon: Sparkles },
  }[kind] ?? { letter: "W", color: "#185abd", back: "#41a5ee", Icon: FileText };
  return (
    <span
      className="office-app-icon"
      style={
        {
          "--icon-color": app.color,
          "--icon-back": app.back,
          width: size,
          height: size,
          fontSize: size * 0.46,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="office-icon-sheet">
        <app.Icon size={size * 0.54} strokeWidth={1.5} />
      </span>
      <b>{app.letter}</b>
    </span>
  );
}
export function TemplatePreview({
  kind,
  template,
}: {
  kind: string;
  template: string;
}) {
  return (
    <div className={`template-preview ${kind} ${template}`} aria-hidden="true">
      {template === "blank" ? (
        <div className="template-blank">
          <span>+</span>
        </div>
      ) : kind === "sheet" ? (
        <div className="template-workbook">
          <strong>PROJECT BUDGET</strong>
          <div className="template-cells">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i}>
                {i < 4
                  ? ["Item", "Planned", "Actual", "Total"][i]
                  : i % 4 === 0
                    ? ["Materials", "Labour", "Other", "Total"][
                        Math.floor(i / 4) - 1
                      ] || ""
                    : i > 19
                      ? "0.00"
                      : ""}
              </i>
            ))}
          </div>
          <div className="template-bars">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : kind === "slides" ? (
        <div className="template-slide">
          <span>PROJECT UPDATE</span>
          <strong>
            Ideas into
            <br />
            impact.
          </strong>
          <small>Progress. People. Possibilities.</small>
          <div className="slide-orbit" />
        </div>
      ) : (
        <div className="template-paper">
          <span>
            {template === "report" ? "PROJECT REPORT" : "MEETING MINUTES"}
          </span>
          <strong>
            {template === "report" ? "Project\nreport" : "Meeting\nminutes"}
          </strong>
          <i />
          <i />
          <i />
          <div className="paper-mini-table" />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
