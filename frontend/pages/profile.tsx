import { ChangeEvent, useEffect, useState } from "react";
import { Camera, Check, Pencil, UserRound, X } from "lucide-react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type ProfileData = {
  memberId: string;
  fullName: string;
  age: number | string;
  email: string;
  position: string;
  status: "ACTIVE" | "BLOCKED";
  photoUrl: string | null;
};

export default function Profile() {
  const { user, isLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editing, setEditing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getProfilePhotoUrl = (photoUrl: string | null) => {
    if (!photoUrl) return null;

    const normalizedPhotoUrl = /^https?:\/\//.test(photoUrl)
      ? photoUrl
      : `${getApiUrl()}${photoUrl}`;

    const versionMatch = normalizedPhotoUrl.match(/profile-(\d+)/i);
    const version = versionMatch?.[1] ?? Date.now();
    const separator = normalizedPhotoUrl.includes("?") ? "&" : "?";

    return `${normalizedPhotoUrl}${separator}v=${version}`;
  };

  const photoUrl = getProfilePhotoUrl(profile?.photoUrl ?? null);

  useEffect(() => {
    if (isLoading || !user) return;

    fetcher(`${getApiUrl()}/api/members/me/profile`)
      .then((data) => {
        setProfile(data);
        setName(data.fullName ?? "");
        setAge(data.age === "" || data.age == null ? "" : String(data.age));
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load profile."
        );
      })
      .finally(() => setLoading(false));
  }, [user, isLoading]);

  function handlePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be 5 MB or smaller.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSelectedPhoto(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!profile) return;

    const trimmedName = name.trim();
    const numericAge = Number(age);

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    if (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) {
      setError("Please enter a valid age.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await fetcher(`${getApiUrl()}/api/members/me/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: trimmedName,
          age: numericAge,
        }),
      });

      setProfile((current) =>
        current
          ? {
              ...current,
              fullName: trimmedName,
              age: numericAge,
            }
          : current
      );

      if (selectedPhoto) {
        setPhotoUploading(true);

        const formData = new FormData();
        formData.append("photo", selectedPhoto);

        const response = await authFetch(`${getApiUrl()}/api/members/me/profile/photo`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to upload profile photo.");
        }

        setProfile((current) =>
          current
            ? {
                ...current,
                photoUrl: data.photoUrl,
              }
            : current
        );

        setSelectedPhoto(null);
        setPhotoPreview(null);
      }

      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update profile."
      );
    } finally {
      setSaving(false);
      setPhotoUploading(false);
    }
  }

  function cancelEditing() {
    if (!profile) return;

    setName(profile.fullName);
    setAge(profile.age === "" || profile.age == null ? "" : String(profile.age));
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setEditing(false);
    setError(null);
  }

  if (isLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-600">Loading profile...</p>
      </div>
    );
  }

  if (!user) return null;

  if (!profile) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || "Profile information is not available."}
      </div>
    );
  }

  const displayedPhoto = photoPreview || photoUrl;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              MEMBER ACCOUNT
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              MY PROFILE
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Manage your personal profile information.
            </p>
          </div>

          {!editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
                setSuccess(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:opacity-90"
            >
              <Pencil size={17} />
              EDIT PROFILE
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-5 border-b border-slate-100 pb-7">
          <div className="relative">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-slate-100 bg-slate-100 shadow-sm">
              {displayedPhoto ? (
                <img
                  src={displayedPhoto}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound size={48} className="text-slate-400" />
              )}
            </div>

            {editing && (
              <label
                htmlFor="profile-photo"
                className="absolute bottom-0 right-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:opacity-90"
                title="Change profile photo"
              >
                <Camera size={19} />
              </label>
            )}

            <input
              id="profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoSelect}
              disabled={!editing || saving}
            />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-950">
              {profile.fullName}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              RC NUMBER: {profile.memberId}
            </p>

            <span
              className={
                profile.status === "ACTIVE"
                  ? "mt-3 inline-flex rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-bold text-emerald-700"
                  : "mt-3 inline-flex rounded-full bg-red-100 px-4 py-1.5 text-sm font-bold text-red-700"
              }
            >
              {profile.status === "ACTIVE" ? "ACTIVE" : "BLOCKED"}
            </span>

            {editing && (
              <p className="mt-3 text-xs text-slate-500">
                JPG, PNG or WEBP • Maximum 5 MB
              </p>
            )}
          </div>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              NAME
            </label>

            {editing ? (
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500"
              />
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                {profile.fullName}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              AGE
            </label>

            {editing ? (
              <input
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(event) => setAge(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500"
              />
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                {profile.age || "--"}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              EMAIL
            </label>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
              {profile.email || "--"}
            </div>
            <p className="mt-1 text-xs text-slate-400">Cannot be edited</p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              RC NUMBER
            </label>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
              {profile.memberId}
            </div>
            <p className="mt-1 text-xs text-slate-400">Cannot be edited</p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              POSITION
            </label>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
              {profile.position || "--"}
            </div>
            <p className="mt-1 text-xs text-slate-400">Cannot be changed</p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              STATUS
            </label>
            <div>
              <span
                className={
                  profile.status === "ACTIVE"
                    ? "inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700"
                    : "inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-bold text-red-700"
                }
              >
                {profile.status === "ACTIVE" ? "ACTIVE" : "BLOCKED"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Managed by Owner</p>
          </div>
        </div>

        {editing && (
          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <X size={17} />
              CANCEL
            </button>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <Check size={17} />
              {saving
                ? photoUploading
                  ? "UPLOADING PHOTO..."
                  : "SAVING..."
                : "SAVE CHANGES"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}


