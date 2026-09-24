import { useEffect, useState } from "react";
import { getApiUrl, getAuthToken, clearAuthToken } from "./api";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const token = getAuthToken();

      if (!token) {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${getApiUrl()}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          clearAuthToken();

          if (mounted) {
            setUser(null);
            setIsLoading(false);
          }

          return;
        }

        const data = await response.json();

        if (mounted) {
          setUser(data.user ?? data);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
