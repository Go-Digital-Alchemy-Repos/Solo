import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  screen?: string;
  platform: string;
  timestamp: string;
}

const recentErrors: ErrorReport[] = [];
const MAX_RECENT = 20;

function buildReport(
  error: Error,
  extra?: { componentStack?: string; screen?: string },
): ErrorReport {
  return {
    message: error.message,
    stack: error.stack?.slice(0, 1000),
    componentStack: extra?.componentStack?.slice(0, 500),
    screen: extra?.screen,
    platform: Platform.OS,
    timestamp: new Date().toISOString(),
  };
}

export function reportError(
  error: Error,
  extra?: { componentStack?: string; screen?: string },
) {
  const report = buildReport(error, extra);

  recentErrors.unshift(report);
  if (recentErrors.length > MAX_RECENT) {
    recentErrors.length = MAX_RECENT;
  }

  console.error(
    `[Solo Error] ${report.message}`,
    report.screen ? `(screen: ${report.screen})` : "",
    report.stack ? `\n${report.stack}` : "",
  );

  try {
    const url = new URL("/api/telemetry/error", getApiUrl()).toString();
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    }).catch(() => {});
  } catch {}
}

export function getRecentErrors(): ErrorReport[] {
  return [...recentErrors];
}

export function useErrorHandler() {
  return {
    captureError: (error: Error, screen?: string) => {
      reportError(error, { screen });
    },
    captureWarning: (message: string, screen?: string) => {
      console.warn(`[Solo Warning] ${message}`, screen ? `(screen: ${screen})` : "");
    },
  };
}
