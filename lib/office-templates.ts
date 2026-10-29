import type { FileContent, FileKind } from "./types";
export const OFFICE_TEMPLATES = {
  document: [
    { id: "blank", name: "Blank document" },
    { id: "report", name: "Project report" },
    { id: "minutes", name: "Meeting minutes" },
  ],
  sheet: [
    { id: "blank", name: "Blank workbook" },
    { id: "budget", name: "Project budget" },
  ],
  slides: [
    { id: "blank", name: "Blank presentation" },
    { id: "project", name: "Project update" },
  ],
} as const;
export function templateContent(
  kind: FileKind,
  template: string,
): FileContent | undefined {
  if (!OFFICE_TEMPLATES[kind].some((t) => t.id === template))
    throw Error("Choose a supported template.");
  if (template === "blank") return undefined;
  if (template === "report")
    return {
      html: "<h1>Project report</h1><p>Project name · Reporting period</p><h2>Executive summary</h2><p>Summarize progress, decisions and outcomes.</p><h2>Milestones</h2><table><tr><td>Milestone</td><td>Owner</td><td>Due date</td><td>Status</td></tr><tr><td>Next milestone</td><td></td><td></td><td></td></tr></table><h2>Risks and next steps</h2><p>Record the actions for the next reporting period.</p>",
    };
  if (template === "minutes")
    return {
      html: "<h1>Meeting minutes</h1><p>Date · Time · Location</p><h2>Attendees</h2><p>List participants here.</p><h2>Discussion</h2><p>Record key points and decisions.</p><h2>Action items</h2><table><tr><td>Action</td><td>Owner</td><td>Due</td></tr><tr><td></td><td></td><td></td></tr></table>",
    };
  if (template === "budget")
    return {
      cells: {
        A1: "Item",
        B1: "Planned",
        C1: "Actual",
        D1: "Variance",
        A2: "Materials",
        B2: "0",
        C2: "0",
        D2: "=B2-C2",
        A3: "Labour",
        B3: "0",
        C3: "0",
        D3: "=B3-C3",
        A4: "Other",
        B4: "0",
        C4: "0",
        D4: "=B4-C4",
        A5: "Total",
        B5: "=SUM(B2:B4)",
        C5: "=SUM(C2:C4)",
        D5: "=B5-C5",
      },
    };
  return {
    slides: [
      {
        title: "Project update",
        body: "Project name · Reporting period",
        notes: "Introduce the project and reporting period.",
        color: "#1d5145",
      },
      {
        title: "Progress & milestones",
        body: "Completed work\nUpcoming milestones\nKey decisions",
        notes: "Summarize measurable progress.",
        color: "#23344e",
      },
      {
        title: "Risks & next steps",
        body: "Current risks\nOwners and due dates\nSupport needed",
        notes: "Close with clear actions and owners.",
        color: "#1d5145",
      },
    ],
  };
}
