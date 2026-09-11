import { FormEvent, useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

type Announcement = {
  id: number;
  title: string;
  content: string;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  publishedAt?: string | null;
  isPublished: boolean;
  isPinned: boolean;
  targetType: "ALL" | "GRADE" | "MEMBER";
  targetGrade?: string | null;
  targetMemberId?: string | null;
  createdAt: string;
};

const emptyForm = {
  title: "",
  content: "",
  scheduledAt: "",
  expiresAt: "",
  isPublished: true,
  isPinned: false,
  targetType: "ALL" as "ALL" | "GRADE" | "MEMBER",
  targetGrade: "",
  targetMemberId: "",
};

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetcher(`${getApiUrl()}/api/announcements`);
      setAnnouncements(data);
    } catch (err: any) {
      setError(err.message || "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submitAnnouncement = async (event: FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      if (!form.title.trim() || !form.content.trim()) {
        setError("Title and content are required.");
        return;
      }

      if (form.targetType === "GRADE" && !form.targetGrade.trim()) {
        setError("Target grade is required.");
        return;
      }

      if (
        form.targetType === "MEMBER" &&
        !form.targetMemberId.trim()
      ) {
        setError("Target member ID is required.");
        return;
      }

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        scheduledAt: form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : null,
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : null,
        isPublished: form.isPublished,
        isPinned: form.isPinned,
        targetType: form.targetType,
        targetGrade:
          form.targetType === "GRADE"
            ? form.targetGrade.trim()
            : null,
        targetMemberId:
          form.targetType === "MEMBER"
            ? form.targetMemberId.trim()
            : null,
      };

      if (editingId) {
        await fetcher(
          `${getApiUrl()}/api/announcements/${editingId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        setMessage("Announcement updated successfully.");
      } else {
        await fetcher(`${getApiUrl()}/api/announcements`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        setMessage("Announcement created successfully.");
      }

      resetForm();
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || "Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  };

  const editAnnouncement = (announcement: Announcement) => {
    setEditingId(announcement.id);

    setForm({
      title: announcement.title || "",
      content: announcement.content || "",
      scheduledAt: announcement.scheduledAt
        ? new Date(announcement.scheduledAt)
            .toISOString()
            .slice(0, 16)
        : "",
      expiresAt: announcement.expiresAt
        ? new Date(announcement.expiresAt)
            .toISOString()
            .slice(0, 16)
        : "",
      isPublished: announcement.isPublished,
      isPinned: announcement.isPinned,
      targetType: announcement.targetType || "ALL",
      targetGrade: announcement.targetGrade || "",
      targetMemberId: announcement.targetMemberId || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePin = async (id: number) => {
    try {
      setError(null);
      setMessage(null);

      await fetcher(
        `${getApiUrl()}/api/announcements/${id}/pin`,
        {
          method: "PATCH",
        }
      );

      setMessage("Pin status updated.");
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || "Failed to update pin status.");
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this announcement?"
      )
    ) {
      return;
    }

    try {
      setError(null);
      setMessage(null);

      await fetcher(
        `${getApiUrl()}/api/announcements/${id}`,
        {
          method: "DELETE",
        }
      );

      setMessage("Announcement deleted successfully.");

      if (editingId === id) {
        resetForm();
      }

      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || "Failed to delete announcement.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">
              Announcements
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Create and manage announcements for members.
            </p>
          </div>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + New Announcement
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">
            {editingId
              ? "Edit Announcement"
              : "Create Announcement"}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Publish immediately or configure scheduling and targeting.
          </p>
        </div>

        <form onSubmit={submitAnnouncement} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Title
              </label>

              <input
                value={form.title}
                onChange={(e) =>
                  setForm({
                    ...form,
                    title: e.target.value,
                  })
                }
                placeholder="Announcement title"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Content
              </label>

              <textarea
                value={form.content}
                onChange={(e) =>
                  setForm({
                    ...form,
                    content: e.target.value,
                  })
                }
                placeholder="Write your announcement..."
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Target
              </label>

              <select
                value={form.targetType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetType: e.target.value as
                      | "ALL"
                      | "GRADE"
                      | "MEMBER",
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="ALL">Everyone</option>
                <option value="GRADE">Specific Grade</option>
                <option value="MEMBER">Specific Member</option>
              </select>
            </div>

            {form.targetType === "GRADE" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Target Grade
                </label>

                <input
                  value={form.targetGrade}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetGrade: e.target.value,
                    })
                  }
                  placeholder="Example: Grade 10"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
              </div>
            )}

            {form.targetType === "MEMBER" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Member ID
                </label>

                <input
                  value={form.targetMemberId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetMemberId: e.target.value,
                    })
                  }
                  placeholder="Member ID"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Schedule
              </label>

              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scheduledAt: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Expiry
              </label>

              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    expiresAt: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isPublished: e.target.checked,
                  })
                }
              />
              Publish
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isPinned: e.target.checked,
                  })
                }
              />
              Pin announcement
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Update Announcement"
                : "Create Announcement"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">
            Existing Announcements
          </h2>

          <button
            type="button"
            onClick={loadAnnouncements}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Loading announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No announcements available.
          </div>
        ) : (
          announcements.map((announcement) => (
            <article
              key={announcement.id}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {announcement.title}
                    </h3>

                    {announcement.isPinned && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        📌 Pinned
                      </span>
                    )}

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        announcement.isPublished
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {announcement.isPublished
                        ? "Published"
                        : "Draft"}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {announcement.content}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      Target:{" "}
                      {announcement.targetType === "ALL"
                        ? "Everyone"
                        : announcement.targetType === "GRADE"
                        ? `Grade ${announcement.targetGrade}`
                        : `Member ${announcement.targetMemberId}`}
                    </span>

                    {announcement.scheduledAt && (
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Scheduled:{" "}
                        {new Date(
                          announcement.scheduledAt
                        ).toLocaleString()}
                      </span>
                    )}

                    {announcement.expiresAt && (
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Expires:{" "}
                        {new Date(
                          announcement.expiresAt
                        ).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      editAnnouncement(announcement)
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      togglePin(announcement.id)
                    }
                    className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
                  >
                    {announcement.isPinned
                      ? "Unpin"
                      : "Pin"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      deleteAnnouncement(announcement.id)
                    }
                    className="rounded-xl border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
