declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage(message: string): void;
      };
    };
  }
}

export const getApiUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname === "127.0.0.1" ? "localhost" : window.location.hostname}:8000`
    : "http://localhost:8000");

export const getAuthToken = () =>
  typeof window !== "undefined"
    ? localStorage.getItem("authToken")
    : null;

export const setAuthToken = (token: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("authToken", token);

    const nativeWebView = (window as Window & {
      chrome?: {
        webview?: {
          postMessage?: (message: string) => void;
        };
      };
    }).chrome?.webview;

    if (nativeWebView?.postMessage) {
      nativeWebView.postMessage(
        JSON.stringify({
          type: "AUTO_CARD_AUTH_TOKEN_SET",
          token,
        })
      );
    }
  }
};

export const clearAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("authToken");

    const nativeWebView = (window as Window & {
      chrome?: {
        webview?: {
          postMessage?: (message: string) => void;
        };
      };
    }).chrome?.webview;

    if (nativeWebView?.postMessage) {
      nativeWebView.postMessage(
        JSON.stringify({
          type: "AUTO_CARD_AUTH_TOKEN_CLEAR",
        })
      );
    }
  }
};

export async function authFetch(
  input: RequestInfo,
  init: RequestInit = {}
) {
  const token = getAuthToken();

  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearAuthToken();
  }

  return response;
}

export const fetcher = async (
  url: string,
  init: RequestInit = {}
) => {
  const response = await authFetch(url, init);

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const body = await response.json();
      message = body?.error || body?.message || message;
    } catch {
      // Ignore invalid/non-JSON responses.
    }

    throw new Error(message);
  }

  return response.json();
};
