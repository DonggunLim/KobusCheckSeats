"use client";

import { createContext, useContext, ReactNode } from "react";
import { useJobHistory } from "./useJobHistory";
import type { JobHistoryItem } from "./types";

interface JobHistoryContextType {
  jobs: JobHistoryItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const JobHistoryContext = createContext<JobHistoryContextType | undefined>(
  undefined
);

export function JobHistoryProvider({
  children,
  limit = 20,
}: {
  children: ReactNode;
  limit?: number;
}) {
  const jobHistory = useJobHistory(limit);

  return (
    <JobHistoryContext.Provider value={jobHistory}>
      {children}
    </JobHistoryContext.Provider>
  );
}

export function useJobHistoryContext() {
  const context = useContext(JobHistoryContext);
  if (!context) {
    throw new Error(
      "useJobHistoryContext must be used within JobHistoryProvider"
    );
  }
  return context;
}
