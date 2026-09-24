import { useEffect, useState } from "react";
import {
  applyGlobalAppearance,
  applyGlobalLanguage,
  getStoredLanguage,
} from "../lib/i18n";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import AppShell from "../components/AppShell";

const companyServices = [
  "Website Development",
  "Web Application Development",
  "Business Management Systems",
  "Custom Software Development",
  "Database & Backend Systems",
  "API Development & Integration",
  "UI/UX Design",
  "Automation Solutions",
  "AI-Powered Solutions",
  "Security-Focused Digital Systems",
  "System Maintenance & Support",
  "Custom Digital Solutions",
];

const companyProducts = [
  "Business Websites",
  "Management Systems",
  "Payment & Membership Systems",
  "Education & Institution Platforms",
  "Customer Management Systems",
  "Automation Platforms",
  "AI-Powered Applications",
  "Custom Web Applications",
  "Secure Backend & Database Systems",
  "Customized Digital Platforms",
];

function CompanyProfileModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const openTelegram = () => window.open("https://t.me/MICORTEXX", "_blank", "noopener,noreferrer");

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: "16px", background: "linear-gradient(135deg, rgba(2, 6, 23, 0.88), rgba(15, 23, 42, 0.78))", backdropFilter: "blur(14px)" }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="company-profile-title" style={{ position: "relative", width: "min(860px, 100%)", maxHeight: "min(760px, calc(100vh - 32px))", display: "flex", flexDirection: "column", border: "1px solid rgba(125, 211, 252, 0.35)", borderRadius: "28px", background: "linear-gradient(145deg, #08152d 0%, #101b3d 48%, #241044 100%)", boxShadow: "0 30px 100px rgba(2, 8, 23, 0.65), 0 0 80px rgba(56, 189, 248, 0.16)", color: "#e0f2fe" }}>
        <div style={{ position: "absolute", top: "-110px", right: "-70px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(217, 70, 239, 0.26)", filter: "blur(42px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "80px", left: "-120px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(34, 211, 238, 0.18)", filter: "blur(46px)", pointerEvents: "none" }} />

        <header style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "26px 28px 18px", textAlign: "center", borderBottom: "1px solid rgba(125, 211, 252, 0.2)", background: "linear-gradient(120deg, rgba(14, 116, 144, 0.34), rgba(124, 58, 237, 0.26), rgba(219, 39, 119, 0.2))" }}>
          <img src="/assets/Cortex.png" alt="MI CORTEX X INC. logo" style={{ position: "relative", width: "78px", height: "78px", border: "2px solid rgba(165, 243, 252, 0.8)", borderRadius: "22px", objectFit: "cover", boxShadow: "0 0 0 8px rgba(34, 211, 238, 0.1), 0 18px 40px rgba(34, 211, 238, 0.28)" }} />
          <p style={{ margin: 0, color: "#a5f3fc", fontSize: "11px", fontWeight: 800, letterSpacing: "0.2em" }}>TECHNOLOGY PARTNER</p>
          <h2 id="company-profile-title" style={{ margin: 0, color: "#ffffff", fontSize: "clamp(1.7rem, 4vw, 2.5rem)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "0.02em" }}>MI CORTEX X INC.</h2>
          <p style={{ margin: "8px 0 0", color: "#e2e8f0", fontSize: "0.9rem", lineHeight: 1.6, maxWidth: "620px" }}>Turning ideas into modern digital solutions — designed, developed, and built around your requirements.</p>
          <button type="button" aria-label="Close company profile" onClick={onClose} style={{ position: "absolute", top: "16px", right: "18px", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#ffffff", fontSize: "21px", lineHeight: 1, cursor: "pointer", backdropFilter: "blur(8px)" }}>×</button>
        </header>

        <div style={{ position: "relative", flex: 1, overflowY: "auto", minHeight: 0, display: "grid", gap: "14px", padding: "22px 28px 18px" }}>
          <article style={{ padding: "18px 20px", border: "1px solid rgba(125, 211, 252, 0.2)", borderRadius: "18px", background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(14, 116, 144, 0.08))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <h3 style={{ margin: "0 0 10px", color: "#67e8f9", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>About The Company</h3>
            <p style={{ margin: 0, color: "#dbeafe", fontSize: "0.9rem", lineHeight: 1.7 }}>
              MI CORTEX X INC. develops modern digital solutions with a focus on practical design, reliable technology, scalable systems, security, and client-specific requirements. Our approach combines thoughtful planning, modern development practices, testing, deployment, and continued support to turn ideas into working digital products.
            </p>
          </article>

          <article style={{ padding: "18px 20px", border: "1px solid rgba(251, 113, 133, 0.22)", borderRadius: "18px", background: "rgba(190, 24, 93, 0.12)" }}>
            <h3 style={{ margin: "0 0 12px", color: "#fda4af", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>Development Approach</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Idea</span>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>→</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Design</span>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>→</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Development</span>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>→</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Testing</span>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>→</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Deployment</span>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>→</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(253, 164, 175, 0.35)", background: "rgba(255,255,255,0.06)", color: "#ffe4e6", padding: "8px 12px", fontSize: "0.72rem", fontWeight: 700 }}>Support</span>
            </div>
            <p style={{ margin: 0, color: "#fecdd3", fontSize: "0.83rem", lineHeight: 1.6 }}>
              Every project is developed through a structured process designed to keep the solution practical, maintainable, secure, and aligned with the client&apos;s requirements.
            </p>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
            <article style={{ padding: "18px 20px", border: "1px solid rgba(103, 232, 249, 0.2)", borderRadius: "18px", background: "rgba(8, 145, 178, 0.13)" }}>
              <h3 style={{ margin: "0 0 12px", color: "#67e8f9", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>Services</h3>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "7px", color: "#cffafe", fontSize: "0.78rem", lineHeight: 1.5 }}>
                {companyServices.map((service) => <li key={service}>{service}</li>)}
              </ul>
            </article>

            <article style={{ padding: "18px 20px", border: "1px solid rgba(253, 186, 116, 0.22)", borderRadius: "18px", background: "rgba(234, 88, 12, 0.13)" }}>
              <h3 style={{ margin: "0 0 12px", color: "#fdba74", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>What We Build</h3>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "7px", color: "#ffedd5", fontSize: "0.78rem", lineHeight: 1.5 }}>
                {companyProducts.map((product) => <li key={product}>{product}</li>)}
              </ul>
            </article>
          </div>

          <article style={{ padding: "18px 20px", border: "1px solid rgba(196, 181, 253, 0.22)", borderRadius: "18px", background: "rgba(124, 58, 237, 0.12)" }}>
            <h3 style={{ margin: "0 0 12px", color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>Leadership</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 18px" }}>
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={{ color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Owner</span>
                <strong style={{ color: "#f5f3ff", fontSize: "0.94rem" }}>M.I.MUHAMMADH</strong>
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={{ color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Founder</span>
                <strong style={{ color: "#f5f3ff", fontSize: "0.94rem" }}>M.I.MUHAMMADH</strong>
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={{ color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>CEO</span>
                <strong style={{ color: "#f5f3ff", fontSize: "0.94rem" }}>M.I.MUHAMMADH</strong>
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={{ color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Chairman</span>
                <strong style={{ color: "#f5f3ff", fontSize: "0.94rem" }}>M.I.MUHAMMADH</strong>
              </div>
            </div>
          </article>

          <p style={{ margin: "2px 0 0", color: "#dbeafe", fontSize: "0.9rem", lineHeight: 1.7 }}>
            From a simple idea to a complete working platform, MI CORTEX X INC. builds solutions around the actual needs of the client.
          </p>
        </div>

        <footer style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "16px 20px 18px", borderTop: "1px solid rgba(125, 211, 252, 0.2)", background: "rgba(2, 6, 23, 0.32)" }}>
          <span style={{ color: "#c4b5fd", fontSize: "0.8rem", lineHeight: 1.5, textAlign: "center" }}>Have an idea? Let&apos;s turn it into something real.</span>
          <button type="button" onClick={openTelegram} style={{ border: 0, borderRadius: "12px", padding: "12px 22px", background: "linear-gradient(135deg, #06b6d4, #7c3aed 52%, #db2777)", color: "#ffffff", fontSize: "0.76rem", fontWeight: 900, letterSpacing: "0.12em", cursor: "pointer", boxShadow: "0 10px 26px rgba(124, 58, 237, 0.35)", minWidth: "170px" }}>ORDER NOW</button>
        </footer>
      </section>
    </div>
  );
}

function GlobalFooter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <footer style={{ width: "100%", padding: "24px 12px 16px", marginTop: "28px", textAlign: "center", color: "rgba(100, 116, 139, 0.62)", fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", lineHeight: 1.5, border: "none", background: "transparent", outline: "none", boxShadow: "none" }}>
        <span>BUILT AND DEVELOPED BY MI CORTEX X INC.</span>
        <button type="button" onClick={() => setIsOpen(true)} aria-label="Open MI CORTEX X INC. details" style={{ display: "inline-flex", marginLeft: "8px", padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", verticalAlign: "middle" }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" /></svg>
        </button>
      </footer>
      {isOpen && <CompanyProfileModal onClose={() => setIsOpen(false)} />}
    </>
  );
}

export default function App({ Component, pageProps, router }: AppProps) {
  useEffect(() => {
    const applySettings = () => {
      const language =
        getStoredLanguage() ||
        localStorage.getItem("app-language") ||
        "English";

      const theme =
        (localStorage.getItem("app-theme") as
          | "system"
          | "light"
          | "dark") || "system";

      applyGlobalLanguage(language);
      applyGlobalAppearance(theme);

      const root = document.documentElement;

      if (theme === "dark") {
        root.setAttribute("data-theme", "dark");
        root.classList.add("dark");
      } else if (theme === "light") {
        root.setAttribute("data-theme", "light");
        root.classList.remove("dark");
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;

        root.setAttribute(
          "data-theme",
          prefersDark ? "dark" : "light"
        );

        root.classList.toggle("dark", prefersDark);
      }

      root.setAttribute(
        "lang",
        String(language).toLowerCase()
      );
    };

    applySettings();

    window.addEventListener(
      "settings-updated",
      applySettings
    );

    return () => {
      window.removeEventListener(
        "settings-updated",
        applySettings
      );
    };
  }, []);

  // Authentication pages stay completely standalone.
  if (
    router.pathname === "/" ||
    router.pathname === "/register"
  ) {
    return (
      <>
        <Component {...pageProps} />
        <GlobalFooter />
      </>
    );
  }

  return (
    <>
      <AppShell footer={<GlobalFooter />}>
        <Component {...pageProps} />
      </AppShell>
    </>
  );
}
