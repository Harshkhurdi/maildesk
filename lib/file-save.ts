import type { WorkspaceFile } from "./types";

export function mergeSavedFile(current: WorkspaceFile | null, submittedId: string, saved: WorkspaceFile) {
  if (!current || current.id !== submittedId) return current;
  return {...saved,title:current.title,taskId:current.taskId,mailId:current.mailId};
}
