import { useEffect, useState } from "react"; 
import { authFetch, fetcher, getApiUrl } from "../lib/api"; 
import { 
  applyGlobalAppearance, 
  applyGlobalLanguage, 
  getStoredLanguage, 
  type AppLanguage, 
} from "../lib/i18n"; 
 
type UserData = { 
  id?: number; 
  accountId?: string; 
  fullName?: string; 
  email?: string; 
  isOwner?: boolean; 
}; 
 
type Theme = "system" | "light" | "dark"; 
 
export default function Settings() { 
  const [user, setUser] = useState<UserData | null>(null); 
  const [status, setStatus] = useState<string | null>(null); 
  const [error, setError] = useState<string | null>(null); 
  const [saving, setSaving] = useState(false); 
 
  const [fullName, setFullName] = useState(""); 
  const [email, setEmail] = useState(""); 
 
  const [theme, setTheme] = useState<Theme>( 
    typeof window !== "undefined" 
      ? ((localStorage.getItem("app-theme") as Theme) || "system") 
      : "system" 
  ); 
 
  const [language, setLanguage] = useState<AppLanguage>( 
    typeof window !== "undefined" 
      ? getStoredLanguage() 
      : "English" 
  ); 
 
  const [notificationsEnabled, setNotificationsEnabled] = useState( 
    typeof window !== "undefined" 
      ? localStorage.getItem("notifications-enabled") !== "false" 
      : true 
  ); 
 
  const [securityAlerts, setSecurityAlerts] = useState( 
    typeof window !== "undefined" 
      ? localStorage.getItem("security-alerts") !== "false" 
      : true 
  ); 
 
  const [paymentAlerts, setPaymentAlerts] = useState( 
    typeof window !== "undefined" 
      ? localStorage.getItem("payment-alerts") !== "false" 
      : true 
  ); 
 
  const [systemAlerts, setSystemAlerts] = useState( 
    typeof window !== "undefined" 
      ? localStorage.getItem("system-alerts") !== "false" 
      : true 
  ); 
 
  const [currentPassword, setCurrentPassword] = useState(""); 
  const [newPassword, setNewPassword] = useState(""); 
  const [confirmPassword, setConfirmPassword] = useState(""); 
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null); 
 
  useEffect(() => { 
    fetcher(`${getApiUrl()}/api/auth/me`) 
      .then((data) => { 
        setUser(data); 
        setFullName(data?.fullName || ""); 
        setEmail(data?.email || ""); 
      }) 
      .catch((err) => setError(err.message)); 
 
    fetcher(`${getApiUrl()}/api/system/health`) 
      .then(() => setStatus("API reachable")) 
      .catch((err) => setStatus(`API unavailable: ${err.message}`)); 
 
    if (typeof window !== "undefined") { 
      applyGlobalLanguage(getStoredLanguage()); 
      applyGlobalAppearance( 
        (localStorage.getItem("app-theme") as Theme) || "system" 
      ); 
    } 
  }, []); 
 
  function saveLanguage() { 
    applyGlobalLanguage(language); 
 
    setStatus( 
      language === "Sinhala" 
        ? "භාෂාව සාර්ථකව වෙනස් කරන ලදී." 
        : language === "Tamil" 
        ? "மொழி வெற்றிகரமாக மாற்றப்பட்டது." 
        : "Language changed successfully." 
    ); 
  } 
 
  function saveAppearance() { 
    applyGlobalAppearance(theme); 
 
    setStatus( 
      language === "Sinhala" 
        ? "පෙනුම සාර්ථකව වෙනස් කරන ලදී." 
        : language === "Tamil" 
        ? "தோற்றம் வெற்றிகரமாக மாற்றப்பட்டது." 
        : "Appearance changed successfully." 
    ); 
  } 
 
  function saveLocalSettings() { 
    if (typeof window === "undefined") return; 
 
    localStorage.setItem( 
      "notifications-enabled", 
      String(notificationsEnabled) 
    ); 
 
    localStorage.setItem( 
      "security-alerts", 
      String(securityAlerts) 
    ); 
 
    localStorage.setItem( 
      "payment-alerts", 
      String(paymentAlerts) 
    ); 
 
    localStorage.setItem( 
      "system-alerts", 
      String(systemAlerts) 
    ); 
 
    window.dispatchEvent(new Event("settings-updated")); 
 
    setStatus( 
      language === "Sinhala" 
        ? "මනාප සාර්ථකව සුරකින ලදී." 
        : language === "Tamil" 
        ? "விருப்பங்கள் வெற்றிகரமாக சேமிக்கப்பட்டன." 
        : "Preferences saved successfully." 
    ); 
  } 
 
  async function saveProfile() { 
    setError(null); 
    setStatus(null); 
    setSaving(true); 
 
    try { 
      const response = await authFetch(`${getApiUrl()}/api/auth/me`, { 
        method: "PATCH", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          fullName, 
          email, 
        }), 
      }); 
 
      if (!response.ok) { 
        const body = await response.json().catch(() => ({})); 
        throw new Error(body.error || "Unable to update profile."); 
      } 
 
      const data = await response.json().catch(() => null); 
 
      if (data) setUser(data); 
 
      setStatus("Profile updated successfully."); 
    } catch (err) { 
      setError( 
        err instanceof Error 
          ? err.message 
          : "Unable to update profile." 
      ); 
    } finally { 
      setSaving(false); 
    } 
  } 
 
  async function changePassword() { 
    setError(null); 
    setPasswordMessage(null); 
 
    if (!currentPassword || !newPassword || !confirmPassword) { 
      setError("Please complete all password fields."); 
      return; 
    } 
 
    if (newPassword !== confirmPassword) { 
      setError("New password and confirmation do not match."); 
      return; 
    } 
 
    if (newPassword.length < 8) { 
      setError("New password must contain at least 8 characters."); 
      return; 
    } 
 
    try { 
      const response = await authFetch( 
        `${getApiUrl()}/api/auth/change-password`, 
        { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ 
            currentPassword, 
            newPassword, 
          }), 
        } 
      ); 
 
      if (!response.ok) { 
        const body = await response.json().catch(() => ({})); 
        throw new Error( 
          body.error || "Unable to change password." 
        ); 
      } 
 
      setCurrentPassword(""); 
      setNewPassword(""); 
      setConfirmPassword(""); 
 
      setPasswordMessage( 
        language === "Sinhala" 
          ? "මුරපදය සාර්ථකව වෙනස් කරන ලදී." 
          : language === "Tamil" 
          ? "கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது." 
          : "Password changed successfully." 
      ); 
    } catch (err) { 
      setError( 
        err instanceof Error 
          ? err.message 
          : "Unable to change password." 
      ); 
    } 
  } 
 
  async function createBackup() { 
    setError(null); 
    setStatus(null); 
 
    try { 
      const response = await authFetch( 
        `${getApiUrl()}/api/backup/create`, 
        { 
          method: "POST", 
        } 
      ); 
 
      if (!response.ok) { 
        const body = await response.json().catch(() => ({})); 
        throw new Error(body.error || "Backup failed."); 
      } 
 
      setStatus("Backup created successfully."); 
    } catch (err) { 
      setError( 
        err instanceof Error 
          ? err.message 
          : "Unable to create backup." 
      ); 
    } 
  } 
 
  function openPage(path: string) { 
    window.location.href = path; 
  } 
 
  function SettingToggle({ 
    label, 
    description, 
    checked, 
    onChange, 
  }: { 
    label: string; 
    description: string; 
    checked: boolean; 
    onChange: (value: boolean) => void; 
  }) { 
    return ( 
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"> 
        <div> 
          <p className="text-sm font-semibold text-slate-900"> 
            {label} 
          </p> 
 
          <p className="mt-1 text-xs text-slate-500"> 
            {description} 
          </p> 
        </div> 
 
        <button 
          type="button" 
          onClick={() => onChange(!checked)} 
          className={`relative h-7 w-12 rounded-full transition ${ 
            checked ? "bg-brand-600" : "bg-slate-300" 
          }`} 
          aria-label={label} 
        > 
          <span 
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${ 
              checked ? "left-6" : "left-1" 
            }`} 
          /> 
        </button> 
      </div> 
    ); 
  } 
 
  return ( 
    <div className="space-y-6"> 
 
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
        <h1 className="text-2xl font-semibold text-slate-950"> 
          Settings 
        </h1> 
 
        <p className="mt-2 text-sm text-slate-600"> 
          Manage your account, security, notifications, appearance and system preferences. 
        </p> 
      </header> 
 
      {error && ( 
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"> 
          {error} 
        </div> 
      )} 
 
      {status && ( 
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700"> 
          {status} 
        </div> 
      )} 
 
      {passwordMessage && ( 
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700"> 
          {passwordMessage} 
        </div> 
      )} 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Account & Profile 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Manage your account information. 
        </p> 
 
        <div className="mt-6 grid gap-4 md:grid-cols-2"> 
 
          <div> 
            <label className="text-sm font-medium text-slate-700"> 
              Full Name 
            </label> 
 
            <input 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)} 
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500" 
            /> 
          </div> 
 
          <div> 
            <label className="text-sm font-medium text-slate-700"> 
              Email 
            </label> 
 
            <input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              type="email" 
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500" 
            /> 
          </div> 
 
          <div> 
            <label className="text-sm font-medium text-slate-700"> 
              Account ID / RC ID 
            </label> 
 
            <input 
              value={user?.accountId || ""} 
              disabled 
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500" 
            /> 
          </div> 
 
          <div> 
            <label className="text-sm font-medium text-slate-700"> 
              Account Type 
            </label> 
 
            <input 
              value={user?.isOwner ? "OWNER" : "MEMBER"} 
              disabled 
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500" 
            /> 
          </div> 
 
        </div> 
 
        <button 
          type="button" 
          onClick={saveProfile} 
          disabled={saving} 
          className="mt-5 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" 
        > 
          {saving ? "Saving..." : "Save Profile"} 
        </button> 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Security 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Protect your account and manage password settings. 
        </p> 
 
        <div className="mt-6 grid gap-4 md:grid-cols-3"> 
 
          <input 
            type="password" 
            placeholder="Current password" 
            value={currentPassword} 
            onChange={(e) => setCurrentPassword(e.target.value)} 
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" 
          /> 
 
          <input 
            type="password" 
            placeholder="New password" 
            value={newPassword} 
            onChange={(e) => setNewPassword(e.target.value)} 
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" 
          /> 
 
          <input 
            type="password" 
            placeholder="Confirm new password" 
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)} 
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" 
          /> 
 
        </div> 
 
        <button 
          type="button" 
          onClick={changePassword} 
          className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" 
        > 
          Change Password 
        </button> 
 
        <div className="mt-6 grid gap-3 md:grid-cols-2"> 
 
          <button 
            type="button" 
            onClick={() => openPage("/security-verification")} 
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100" 
          > 
            <p className="text-sm font-semibold text-slate-900"> 
              Security Verification 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              Open your existing security verification controls. 
            </p> 
          </button> 
 
          <button 
            type="button" 
            onClick={() => openPage("/audit-logs")} 
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100" 
          > 
            <p className="text-sm font-semibold text-slate-900"> 
              Activity & Audit Logs 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              View recorded account and system activity. 
            </p> 
          </button> 
 
        </div> 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Notifications 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Choose which notifications you want to receive. 
        </p> 
 
        <div className="mt-5 space-y-3"> 
 
          <SettingToggle 
            label="Notifications" 
            description="Enable or disable application notifications." 
            checked={notificationsEnabled} 
            onChange={setNotificationsEnabled} 
          /> 
 
          <SettingToggle 
            label="Security Alerts" 
            description="Receive important security notifications." 
            checked={securityAlerts} 
            onChange={setSecurityAlerts} 
          /> 
 
          <SettingToggle 
            label="Payment Alerts" 
            description="Receive payment and transaction notifications." 
            checked={paymentAlerts} 
            onChange={setPaymentAlerts} 
          /> 
 
          <SettingToggle 
            label="System Alerts" 
            description="Receive important system notifications." 
            checked={systemAlerts} 
            onChange={setSystemAlerts} 
          /> 
 
        </div> 
      </section> 
 
      {/* ====================================================== 
          APPEARANCE 
         ====================================================== */} 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Appearance 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Customize how the application looks on your device. 
        </p> 
 
        <div className="mt-5 flex items-center gap-3"> 
 
          <select 
            value={theme} 
            onChange={(e) => 
              setTheme(e.target.value as Theme) 
            } 
            className="w-full max-w-md rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm" 
          > 
            <option value="system"> 
              System Default 
            </option> 
 
            <option value="light"> 
              Light 
            </option> 
 
            <option value="dark"> 
              Dark 
            </option> 
          </select> 
 
          <button 
            type="button" 
            onClick={saveAppearance} 
            title="Apply Appearance" 
            aria-label="Apply Appearance" 
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-sm transition hover:bg-brand-700 active:scale-95" 
          > 
            ☑ 
          </button> 
 
        </div> 
      </section> 
 
      {/* ====================================================== 
          LANGUAGE 
         ====================================================== */} 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Language 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Choose your preferred application language. 
        </p> 
 
        <div className="mt-5 flex items-center gap-3"> 
 
          <select 
            value={language} 
            onChange={(e) => 
              setLanguage(e.target.value as AppLanguage) 
            } 
            className="w-full max-w-md rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm" 
          > 
            <option value="English"> 
              English 
            </option> 
 
            <option value="Sinhala"> 
              සිංහල 
            </option> 
 
            <option value="Tamil"> 
              தமிழ் 
            </option> 
          </select> 
 
          <button 
            type="button" 
            onClick={saveLanguage} 
            title="Apply Language" 
            aria-label="Apply Language" 
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-sm transition hover:bg-brand-700 active:scale-95" 
          > 
            ☑ 
          </button> 
 
        </div> 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          System Preferences 
        </h2> 
 
        <div className="mt-5 grid gap-4 md:grid-cols-2"> 
 
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              API Status 
            </p> 
 
            <p className="mt-1 text-sm text-slate-600"> 
              {status || "Checking..."} 
            </p> 
 
          </div> 
 
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              System Health 
            </p> 
 
            <button 
              type="button" 
              onClick={() => openPage("/system-health")} 
              className="mt-2 text-sm font-semibold text-brand-600 hover:underline" 
            > 
              Open System Health 
            </button> 
 
          </div> 
 
        </div> 
 
        <button 
          type="button" 
          onClick={saveLocalSettings} 
          className="mt-5 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" 
        > 
          Save Preferences 
        </button> 
 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Backup 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Create a snapshot using the existing backup system. 
        </p> 
 
        <div className="mt-5 flex flex-wrap gap-3"> 
 
          <button 
            type="button" 
            onClick={createBackup} 
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" 
          > 
            Create Backup 
          </button> 
 
          <button 
            type="button" 
            onClick={() => openPage("/backup")} 
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" 
          > 
            Open Backup Manager 
          </button> 
 
        </div> 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Privacy 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Your account activity and security records are managed by the system. 
        </p> 
 
        <div className="mt-5 grid gap-3 md:grid-cols-2"> 
 
          <div className="rounded-2xl bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              Account Activity 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              Account actions may be recorded for security and administration. 
            </p> 
 
          </div> 
 
          <div className="rounded-2xl bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              Security Records 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              Security-related activity can be reviewed through the existing logs. 
            </p> 
 
          </div> 
 
        </div> 
      </section> 
 
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"> 
 
        <h2 className="text-lg font-semibold text-slate-950"> 
          Support 
        </h2> 
 
        <p className="mt-1 text-sm text-slate-600"> 
          Need help with the AUTO-CARD-MARKING system? 
        </p> 
 
        <div className="mt-5 grid gap-3 md:grid-cols-2"> 
 
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              Help Center 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              Use the available system documentation and support channels. 
            </p> 
 
          </div> 
 
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"> 
 
            <p className="text-sm font-semibold text-slate-900"> 
              System Version 
            </p> 
 
            <p className="mt-1 text-xs text-slate-500"> 
              AUTO-CARD-MARKING 
            </p> 
 
          </div> 
 
        </div> 
      </section> 
 
      {user?.isOwner && ( 
        <section className="rounded-3xl border border-brand-200 bg-brand-50 p-6 shadow-sm"> 
 
          <h2 className="text-lg font-semibold text-slate-950"> 
            Owner Settings 
          </h2> 
 
          <p className="mt-1 text-sm text-slate-600"> 
            Owner-only administration tools. 
          </p> 
 
          <div className="mt-5 grid gap-3 md:grid-cols-3"> 
 
            <button 
              type="button" 
              onClick={() => openPage("/users")} 
              className="rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-slate-50" 
            > 
              <p className="text-sm font-semibold text-slate-900"> 
                User Management 
              </p> 
 
              <p className="mt-1 text-xs text-slate-500"> 
                Manage system accounts. 
              </p> 
            </button> 
 
            <button 
              type="button" 
              onClick={() => openPage("/audit-logs")} 
              className="rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-slate-50" 
            > 
              <p className="text-sm font-semibold text-slate-900"> 
                Audit Logs 
              </p> 
 
              <p className="mt-1 text-xs text-slate-500"> 
                Review system activity. 
              </p> 
            </button> 
 
            <button 
              type="button" 
              onClick={() => openPage("/backup")} 
              className="rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-slate-50" 
            > 
              <p className="text-sm font-semibold text-slate-900"> 
                Backup Manager 
              </p> 
 
              <p className="mt-1 text-xs text-slate-500"> 
                Manage system backups. 
              </p> 
            </button> 
 
          </div> 
        </section> 
      )} 
 
    </div> 
  ); 
} 
