"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

/* ─── Icon components (inline SVG, no extra deps) ─────────────────────── */
function Icon({ d, size = 22, stroke = "currentColor" }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const icons = {
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  support: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  chevron: "M9 18l6-6-6-6",
  check: "M20 6L9 17l-5-5",
};

/* ─── Toggle Switch ───────────────────────────────────────────────────── */
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${on ? "bg-emerald-500" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

/* ─── Menu Item ────────────────────────────────────────────────────────── */
function MenuItem({
  icon, label, desc, onClick, trailing, danger,
}: {
  icon: string; label: string; desc?: string; onClick?: () => void;
  trailing?: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-all duration-200
        ${danger
          ? "hover:bg-red-500/10 text-red-400"
          : "hover:bg-white/[0.04] text-white/90"
        }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors
        ${danger ? "bg-red-500/10 text-red-400" : "bg-white/[0.06] text-white/60 group-hover:text-white/80"}`}
      >
        <Icon d={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-tight">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-white/40 truncate">{desc}</p>}
      </div>
      {trailing ?? (onClick && !danger && (
        <span className="text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/40">
          <Icon d={icons.chevron} size={18} />
        </span>
      ))}
    </button>
  );
}

/* ─── Settings Sub-Item ────────────────────────────────────────────────── */
function SubItem({
  icon, label, trailing, onClick,
}: {
  icon: string; label: string; trailing?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-left transition-all duration-200 hover:bg-white/[0.04]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-white/50 group-hover:text-white/70 transition-colors">
        <Icon d={icon} size={18} />
      </span>
      <span className="flex-1 text-[14px] font-medium text-white/80">{label}</span>
      {trailing}
    </button>
  );
}

/* ─── Section Header ───────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-white/25">
      {children}
    </p>
  );
}

/* ─── Main Component ───────────────────────────────────────────────────── */
export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [language, setLanguage] = useState("English");
  const [showLangPicker, setShowLangPicker] = useState(false);

  const languages = ["English", "नेपाली", "हिन्दी", "中文", "日本語"];

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "—";
  const displayPhone = user?.mobile || "Not set";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#0b0f1a] -mx-4 -my-6 px-0 py-0 sm:rounded-3xl sm:mx-0 sm:px-0 sm:my-0 overflow-hidden">
      <div className="mx-auto max-w-lg px-5 py-8">

        {/* ── Profile Card ────────────────────────────────────── */}
        <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1f35] to-[#12162a] p-6 shadow-2xl shadow-black/40 ring-1 ring-white/[0.06]">
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-6 -bottom-6 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative flex items-center gap-5">
            {/* Avatar */}
            <div className="relative">
              <div className="grid h-[68px] w-[68px] place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-xl font-black text-white shadow-lg shadow-emerald-500/25">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-[#1a1f35] bg-emerald-400" />
            </div>

            {/* Name & role */}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-white truncate">
                {loading ? "Loading..." : displayName}
              </h1>
              <p className="mt-0.5 text-sm text-white/40">Premium Member</p>
            </div>

            {/* Verified badge */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <Icon d={icons.check} size={16} />
            </div>
          </div>
        </div>

        {/* ── Account Section ─────────────────────────────────── */}
        <SectionLabel>Account</SectionLabel>
        <div className="mb-6 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.05]">
          <MenuItem icon={icons.user} label="Profile" desc={displayName} />
          <div className="mx-4 border-t border-white/[0.04]" />
          <MenuItem icon={icons.mail} label="Email" desc={displayEmail} />
          <div className="mx-4 border-t border-white/[0.04]" />
          <MenuItem icon={icons.phone} label="Phone" desc={displayPhone} />
        </div>

        {/* ── Settings Section ────────────────────────────────── */}
        <SectionLabel>Settings</SectionLabel>
        <div className="mb-6 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.05]">
          <MenuItem
            icon={icons.settings}
            label="Settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
            trailing={
              <span className={`text-white/30 transition-transform duration-300 ${settingsOpen ? "rotate-90" : ""}`}>
                <Icon d={icons.chevron} size={18} />
              </span>
            }
          />

          {/* Settings panel */}
          <div className={`grid transition-all duration-400 ease-in-out ${settingsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="space-y-0.5 px-1 pt-2 pb-1">
                {/* Language */}
                <div className="relative">
                  <SubItem
                    icon={icons.globe}
                    label="Language"
                    trailing={
                      <span className="text-xs font-semibold text-white/30 bg-white/[0.06] px-2.5 py-1 rounded-lg">
                        {language}
                      </span>
                    }
                    onClick={() => setShowLangPicker(!showLangPicker)}
                  />
                  {showLangPicker && (
                    <div className="absolute right-3 top-12 z-20 w-40 rounded-xl bg-[#1e2340] p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/10">
                      {languages.map((lang) => (
                        <button
                          key={lang}
                          onClick={() => { setLanguage(lang); setShowLangPicker(false); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors
                            ${language === lang ? "bg-emerald-500/15 text-emerald-400 font-semibold" : "text-white/70 hover:bg-white/[0.06]"}`}
                        >
                          {language === lang && <Icon d={icons.check} size={14} />}
                          <span className={language === lang ? "" : "ml-[22px]"}>{lang}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <SubItem
                  icon={icons.moon}
                  label="Dark Mode"
                  trailing={<Toggle on={darkMode} onChange={() => setDarkMode(!darkMode)} />}
                />
                <SubItem
                  icon={icons.bell}
                  label="Notifications"
                  trailing={<Toggle on={notifications} onChange={() => setNotifications(!notifications)} />}
                />
                <SubItem icon={icons.shield} label="Privacy Settings" />
                <SubItem icon={icons.edit} label="Edit Profile" />
                <SubItem icon={icons.key} label="Change Password" />
                <SubItem
                  icon={icons.refresh}
                  label="Auto Update"
                  trailing={<Toggle on={autoUpdate} onChange={() => setAutoUpdate(!autoUpdate)} />}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Support & Security Section ──────────────────────── */}
        <SectionLabel>More</SectionLabel>
        <div className="mb-6 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.05]">
          <MenuItem icon={icons.shield} label="Security" desc="Two-factor, sessions, devices" />
          <div className="mx-4 border-t border-white/[0.04]" />
          <MenuItem icon={icons.support} label="Support" desc="Help center, contact us" />
        </div>

        {/* ── Logout ──────────────────────────────────────────── */}
        <div className="mb-10 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.05]">
          <MenuItem
            icon={icons.logout}
            label="Logout"
            desc="Sign out of your account"
            danger
            onClick={handleLogout}
          />
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-white/15 pb-4">
          DARI SIR v2.0 &middot; Nepal Stock Exchange
        </p>
      </div>
    </div>
  );
}
