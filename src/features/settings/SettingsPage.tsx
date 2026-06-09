export function SettingsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-slate-300/70">General, Security, dan Data preferences.</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="text-sm font-semibold">General</h3>
        <p className="mt-1 text-sm text-slate-300/80">Theme, language, dan font size akan dihubungkan ke Tauri Store.</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="text-sm font-semibold">Security</h3>
        <p className="mt-1 text-sm text-slate-300/80">Credential encryption dan optional master password akan diurus via Stronghold command.</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="text-sm font-semibold">Data</h3>
        <p className="mt-1 text-sm text-slate-300/80">Export dan import konfigurasi disiapkan sebagai command backend.</p>
      </section>
    </div>
  )
}
