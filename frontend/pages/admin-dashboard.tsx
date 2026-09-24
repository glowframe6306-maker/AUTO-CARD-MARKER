import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState("");

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      window.location.href = "/";
      return;
    }

    if (user.isOwner === true) {
      window.location.href = "/dashboard";
      return;
    }

    const roles = Array.isArray(user.roles)
      ? user.roles.map((role: any) =>
          typeof role === "string"
            ? role.toUpperCase()
            : String(
                role?.name ||
                role?.roleName ||
                role?.role?.name ||
                ""
              ).toUpperCase()
        )
      : [];

    const isAdminRole =
      roles.includes("SUPER_ADMIN") ||
      roles.includes("ADMINISTRATOR") ||
      roles.includes("ADMIN");

    if (!isAdminRole) {
      window.location.href = "/member-dashboard";
    }
  }, [user, isLoading]);

  useEffect(() => {
    const updateTime = () => {
      setCurrentDateTime(
        new Date().toLocaleString("en-GB", {
          dateStyle: "full",
          timeStyle: "medium",
        })
      );
    };

    updateTime();

    const interval = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(interval);
  }, []);

  if (isLoading || !user || user.isOwner === true) {
    return null;
  }

  const adminCards = [
    {
      title: "MEMBERS",
      description: "Manage member accounts",
      href: "/members",
      icon: "👥",
    },
    {
      title: "MONTHS MANAGEMENT",
      description: "Manage payment months",
      href: "/months",
      icon: "📅",
    },
    {
      title: "MONTHLY PAYMENTS",
      description: "Manage monthly payments",
      href: "/monthly-payments",
      icon: "💳",
    },
    {
      title: "APPROVALS",
      description: "Review approval requests",
      href: "/approvals",
      icon: "✅",
    },
    {
      title: "REPORTS",
      description: "View system reports",
      href: "/reports",
      icon: "📊",
    },
    {
      title: "OCR REVIEW",
      description: "Review OCR records",
      href: "/ocr-review",
      icon: "🔎",
    },
    {
      title: "NOTIFICATIONS",
      description: "View notifications",
      href: "/notifications",
      icon: "🔔",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                ADMIN DASHBOARD
              </p>

              <h1 className="mt-2 text-2xl font-bold text-slate-900">
                WELCOME {user.fullName || user.accountId || "ADMIN"}
              </h1>

              <p className="mt-2 text-sm text-slate-600">
                READERS CIRCLE OF T.B. JAYAH ZAHIRA COLLEGE
              </p>
            </div>

            <div className="text-sm text-slate-600 md:text-right">
              {currentDateTime}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adminCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="text-3xl">{card.icon}</div>

              <h2 className="mt-4 font-bold text-slate-900">
                {card.title}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {card.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
