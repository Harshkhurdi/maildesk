"use client";
import { createContext, useContext } from "react";
export type WorkspaceIdentity = {
  userId: string;
  isOwner: boolean;
  isGuest: boolean;
};
const Context = createContext<WorkspaceIdentity>({
  userId: "signed-out",
  isOwner: false,
  isGuest: false,
});
export function WorkspaceProvider({
  identity,
  children,
}: {
  identity: WorkspaceIdentity;
  children: React.ReactNode;
}) {
  return <Context.Provider value={identity}>{children}</Context.Provider>;
}
export function useWorkspaceIdentity() {
  return useContext(Context);
}
