"use client";

import { create } from "zustand";

export type Workspace =
  "Dashboard" | "Trade" | "Markets" | "Watchlist" | "Journal" | "Analytics";
export type MobilePanel = "challenge" | "workspace" | "activity";

interface TerminalUiState {
  theme: "dark" | "light";
  workspace: Workspace;
  mobilePanel: MobilePanel;
  notificationsOpen: boolean;
  profileOpen: boolean;
  activityView: "Positions" | "Orders" | "Risk";
  toggleTheme(): void;
  setWorkspace(workspace: Workspace): void;
  setMobilePanel(panel: MobilePanel): void;
  toggleNotifications(): void;
  toggleProfile(): void;
  setActivityView(view: "Positions" | "Orders" | "Risk"): void;
}

export const useTerminalUi = create<TerminalUiState>((set) => ({
  theme: "dark",
  workspace: "Trade",
  mobilePanel: "workspace",
  notificationsOpen: false,
  profileOpen: false,
  activityView: "Positions",
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  setWorkspace: (workspace) => set({ workspace }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  toggleNotifications: () =>
    set((state) => ({
      notificationsOpen: !state.notificationsOpen,
      profileOpen: false,
    })),
  toggleProfile: () =>
    set((state) => ({
      profileOpen: !state.profileOpen,
      notificationsOpen: false,
    })),
  setActivityView: (activityView) => set({ activityView }),
}));
