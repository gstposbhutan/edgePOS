import { QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
        onError: (error: unknown) => {
          handleAuthError(error);
        },
      },
    },
  });
}

function handleAuthError(error: unknown) {
  if (typeof window === "undefined") return;
  const err = error as Record<string, unknown> | null;
  // PocketBase returns 400/401/403 for auth failures
  const status = (err?.status as number) ?? (err?.response as Record<string, number> | undefined)?.status;
  const message = (err?.message as string) || "";

  if (status === 401 || status === 403 ||
      message?.includes("auth") ||
      message?.includes("not authenticated") ||
      message?.includes("Not authenticated")) {
    // Token expired or invalid — clear and redirect
    localStorage.removeItem("pb_auth");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

