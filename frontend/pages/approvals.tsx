import { useEffect, useRef, useState } from "react";
import { authFetch, fetcher, getApiUrl, getAuthToken } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type RegistrationDetails = {
  id: number;
  name: string;
  rcStudentId: string;
  email: string;
  dob: string;
  imagePath: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
};

export default function Approvals() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [registrationDetails, setRegistrationDetails] = useState<Record<string, RegistrationDetails>>({});
  const [registrationImages, setRegistrationImages] = useState<Record<string, string>>({});
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const imageUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadPending() {
      setError(null);
      setLoading(true);

      try {
        // Ensure user is authenticated before requesting owner-only data
        if (!isAuthenticated) {
          setRequests([]);
          return;
        }

        const resp = await authFetch(`${getApiUrl()}/api/approvals/pending`);

        if (!resp.ok) {
          let body: any = {};
          try {
            body = await resp.json();
          } catch {}
          throw new Error(body?.error || `Failed to load approvals (${resp.status}).`);
        }

        const data = await resp.json();
        if (!cancelled) setRequests(data.value || data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load approvals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!authLoading) {
      loadPending();
    }

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistrationData() {
      const registrationRequests = requests.filter(
        (request) => request.targetType === "REGISTRATION"
      );

      for (const request of registrationRequests) {
        const id = String(request.targetId);

        if (!registrationDetails[id]) {
          try {
            const response = await authFetch(
              `${getApiUrl()}/api/registrations/${id}`
            );

            if (response.ok) {
              const details = await response.json();

              if (!cancelled) {
                setRegistrationDetails((current) => ({
                  ...current,
                  [id]: details,
                }));
              }
            }
          } catch {
            // Keep the approval visible even if details temporarily fail.
          }
        }

        if (!imageUrlsRef.current[id]) {
          try {
            const response = await authFetch(
              `${getApiUrl()}/api/registrations/${id}/image`
            );

            if (response.ok) {
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);

              imageUrlsRef.current[id] = objectUrl;

              if (!cancelled) {
                setRegistrationImages((current) => ({
                  ...current,
                  [id]: objectUrl,
                }));
              }
            }
          } catch {
            // Keep approval visible even if image loading fails.
          }
        }
      }
    }

    if (requests.length > 0) {
      loadRegistrationData();
    }

    return () => {
      cancelled = true;
    };
  }, [requests, registrationDetails]);

  useEffect(() => {
    return () => {
      Object.values(imageUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });

      imageUrlsRef.current = {};
    };
  }, []);

  async function review(requestId: string, approved: boolean) {
    setError(null);
    setProcessingIds((p) => ({ ...p, [requestId]: true }));

    try {
      const response = await authFetch(`${getApiUrl()}/api/approvals/review/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved,
          reviewReason: approved ? "Approved via dashboard" : "Rejected via dashboard",
        }),
      });

      let body: any = {};
      try {
        body = await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(body?.error || body?.message || `Unable to review request (${response.status}).`);
      }

      // Success - remove the request from list
      setRequests((current) => current.filter((item) => item.requestId !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setProcessingIds((p) => ({ ...p, [requestId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Approvals</h1>
        <p className="mt-2 text-sm text-slate-600">
          Owner approval queue for pending member and system changes.
        </p>
      </header>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {requests.length ? (
        <div className="space-y-4">
          {requests.map((request) => {
            const isRegistration = request.targetType === "REGISTRATION";
            const isLogoutRequest = request.targetType === "LOGOUT";
            const registration = registrationDetails[String(request.targetId)];
            const registrationImage =
              registrationImages[String(request.targetId)];

            return (
              <div
                key={request.requestId}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                {isRegistration ? (
                  registration ? (
                    <>
                      <p className="text-base font-semibold text-slate-950">
                        NEW MEMBER REGISTRATION
                      </p>

                      <div className="mt-4 space-y-2">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">NAME:</span>{" "}
                          {registration.name}
                        </p>

                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">RC STUDENT ID:</span>{" "}
                          {registration.rcStudentId}
                        </p>

                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">EMAIL ADDRESS:</span>{" "}
                          {registration.email}
                        </p>

                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">DATE OF BIRTH:</span>{" "}
                          {new Date(registration.dob).toLocaleDateString()}
                        </p>

                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">
                            REGISTRATION DATE/TIME:
                          </span>{" "}
                          {new Date(registration.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="mt-5">
                        <p className="text-sm font-semibold text-slate-950">
                          LIVE VERIFICATION PHOTO
                        </p>

                        {registrationImage ? (
                          <img
                            src={registrationImage}
                            alt="Live verification"
                            className="mt-3 max-h-80 w-auto rounded-2xl border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="mt-3 rounded-2xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
                            Loading live verification photo...
                          </div>
                        )}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => review(request.requestId, true)}
                          className="button"
                          disabled={!!processingIds[request.requestId]}
                        >
                          {processingIds[request.requestId] ? "Processing..." : "Approve"}
                        </button>

                        <button
                          onClick={() => review(request.requestId, false)}
                          className="button secondary"
                          disabled={!!processingIds[request.requestId]}
                        >
                          {processingIds[request.requestId] ? "Processing..." : "Reject"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-base font-semibold text-slate-950">
                        NEW MEMBER REGISTRATION
                      </p>

                      <p className="mt-2 text-sm text-slate-500">
                        Loading registration details...
                      </p>
                    </div>
                  )
                ) : isLogoutRequest ? (
                  <>
                    <p className="text-base font-semibold text-slate-950">
                      LOGOUT REQUEST
                    </p>

                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">REQUESTER USER ID:</span>{" "}
                        {request.requesterId ?? request.targetId}
                      </p>

                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">ACCOUNT ID:</span>{" "}
                        {request.newValue?.accountId ?? "-"}
                      </p>

                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">FULL NAME:</span>{" "}
                        {request.newValue?.fullName ?? "-"}
                      </p>

                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">REQUESTED AT:</span>{" "}
                        {new Date(request.createdAt).toLocaleString()}
                      </p>

                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">STATUS:</span>{" "}
                        {request.status}
                      </p>

                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">REASON:</span>{" "}
                        {request.reason}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => review(request.requestId, true)}
                        className="button"
                      >
                        Approve
                      </button>

                      <button
                        onClick={() => review(request.requestId, false)}
                        className="button secondary"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-base font-semibold text-slate-950">
                      {request.targetType} - {request.targetId}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      Action: {request.actionType}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      Reason: {request.reason}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => review(request.requestId, true)}
                        className="button"
                      >
                        Approve
                      </button>

                      <button
                        onClick={() => review(request.requestId, false)}
                        className="button secondary"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No pending approvals at this time.
        </div>
      )}
    </div>
  );
}