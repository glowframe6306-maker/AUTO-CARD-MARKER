export const getApiUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || "/api";

export const getAuthToken = () =>
  typeof window !== "undefined"
    ? localStorage.getItem("authToken")
    : null;

export const setAuthToken = (token: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("authToken", token);
  }
};

export const clearAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("authToken");
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

  if (response.status === 401 || response.status === 403) {
    clearAuthToken();
  }

  return response;
}

export const fetcher = async (url: string) => {
  const response = await authFetch(url);

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const body = await response.json();
      message = body?.error || message;
    } catch {
      // Ignore invalid/non-JSON error responses.
    }

    throw new Error(message);
  }

  return response.json();
};

