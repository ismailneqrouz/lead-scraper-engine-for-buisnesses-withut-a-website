import React, { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

// ===== TYPES =====
type Lead = {
  Name: string;
  Owner: string;
  Phone1: string;
  Phone2: string;
  Phone3: string;
  Address: string;
  Website: string;
  OpeningHours: string;
  Extras: string;
  Category: string;
  City: string;
  LeadStatus: string;
  Source: string;
  CreatedAt?: string;
};

type Stats = {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
};

type ScrapeStatus = {
  status: "idle" | "running" | "done" | "error";
  found?: number;
  saved?: number;
  message?: string;
  category?: string;
  city?: string;
};

type Category = { key: string; label: string };

const API = "http://localhost:5000";
let socket: Socket;

// ===== STYLE CONSTANTS =====
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  New:       { label: "Neu",       bg: "#1e293b", text: "#94a3b8", dot: "#64748b" },
  Converted: { label: "Konvertiert", bg: "#052e16", text: "#4ade80", dot: "#22c55e" },
  Thinking:  { label: "Ausstehend", bg: "#1c1917", text: "#fb923c", dot: "#f97316" },
  No:        { label: "Abgelehnt", bg: "#1c0a0a", text: "#f87171", dot: "#ef4444" },
};

// ===== COMPONENTS =====
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.New;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: cfg.bg, color: cfg.text,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function PhoneChip({ phone }: { phone: string }) {
  if (!phone || phone === "None") return <span style={{ color: "#374151" }}>—</span>;
  return (
    <a href={`tel:${phone}`} style={{
      color: "#60a5fa", textDecoration: "none", fontSize: 12,
      display: "block", whiteSpace: "nowrap",
    }}>
      {phone}
    </a>
  );
}

function SourceTag({ source }: { source: string }) {
  const isGM = source === "GoogleMaps";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 4,
      background: isGM ? "#1e3a5f" : "#1a3320",
      color: isGM ? "#60a5fa" : "#4ade80",
    }}>
      {isGM ? "GMAPS" : "GS"}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937",
      borderRadius: 12, padding: "18px 24px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}

// ===== MAIN APP =====
export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byStatus: {}, byCategory: {} });
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Filters
  const [catFilter, setCatFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Scrape panel
  const [scrapeCategory, setScrapeCategory] = useState("elektriker");
  const [scrapeCity, setScrapeCity] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({ status: "idle" });

  // Detail modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Notification
  const [notify, setNotify] = useState("");
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotify = (msg: string) => {
    setNotify(msg);
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    notifyTimer.current = setTimeout(() => setNotify(""), 3500);
  };

  // ===== FETCH =====
  const fetchLeads = useCallback(async (p = 1) => {
    const params = new URLSearchParams();
    if (catFilter) params.set("category", catFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(p));
    params.set("pageSize", String(pageSize));

    const res = await fetch(`${API}/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setTotal(data.total || 0);
  }, [catFilter, cityFilter, statusFilter, search]);

  const fetchStats = async () => {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();
    setStats(data);
  };

  const fetchCategories = async () => {
    const res = await fetch(`${API}/api/categories`);
    const data = await res.json();
    setCategories(data);
    if (data.length > 0) setScrapeCategory(data[0].key);
  };

  // ===== SOCKET =====
  useEffect(() => {
    socket = io(API, { transports: ["websocket"] });

    socket.on("leads_update", () => {
      fetchLeads(page);
      fetchStats();
    });

    socket.on("scrape_status", (data: ScrapeStatus) => {
      setScrapeStatus(data);
      if (data.status === "done") {
        showNotify(`✅ ${data.found} Leads gefunden, ${data.saved} gespeichert (${data.category} / ${data.city})`);
        fetchLeads(1);
        fetchStats();
        setPage(1);
      }
      if (data.status === "error") {
        showNotify(`❌ Fehler: ${data.message}`);
      }
    });

    fetchCategories();
    fetchStats();
    fetchLeads(1);

    return () => { socket.disconnect(); };
  }, []);

  // Refetch on filter change
  useEffect(() => {
    setPage(1);
    fetchLeads(1);
  }, [catFilter, cityFilter, statusFilter, search]);

  // ===== ACTIONS =====
  const triggerScrape = async () => {
    if (!scrapeCity.trim()) { showNotify("Bitte eine Stadt eingeben."); return; }
    setScrapeStatus({ status: "running" });
    await fetch(`${API}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: scrapeCategory, city: scrapeCity }),
    });
  };

  const updateStatus = async (lead: Lead, status: string) => {
    await fetch(`${API}/api/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: lead.Name, City: lead.City, LeadStatus: status }),
    });
    showNotify(`Status aktualisiert: ${lead.Name}`);
  };

  const deleteLead = async (lead: Lead) => {
    await fetch(`${API}/api/delete-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: lead.Name, City: lead.City }),
    });
    setSelectedLead(null);
    showNotify(`Gelöscht: ${lead.Name}`);
  };

  const exportExcel = () => {
    const params = new URLSearchParams();
    if (catFilter) params.set("category", catFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (statusFilter) params.set("status", statusFilter);
    window.open(`${API}/api/export-excel?${params}`, "_blank");
  };

  const totalPages = Math.ceil(total / pageSize);

  // ===== RENDER =====
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0c10",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Import fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111827; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        input, select { outline: none; }
        input::placeholder { color: #4b5563; }
        table { border-collapse: collapse; }
      `}</style>

      {/* Notification */}
      {notify && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#111827", border: "1px solid #374151",
          borderRadius: 10, padding: "12px 20px",
          fontSize: 13, color: "#e2e8f0",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxWidth: 360,
        }}>
          {notify}
        </div>
      )}

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1f2937",
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 60, background: "#0d1117",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>⚡</div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
            LeadScout
          </span>
          <span style={{
            fontSize: 10, color: "#6b7280", background: "#111827",
            border: "1px solid #1f2937", borderRadius: 4,
            padding: "2px 7px", letterSpacing: "0.08em", fontWeight: 600,
          }}>
            DE TRADE
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={exportExcel}
            style={{
              background: "#111827", border: "1px solid #374151",
              color: "#9ca3af", borderRadius: 8, padding: "7px 16px",
              fontSize: 12, cursor: "pointer", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            📊 Excel Export
          </button>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>

        {/* ===== LEFT SIDEBAR — Scrape Panel ===== */}
        <div style={{
          width: 260, flexShrink: 0,
          borderRight: "1px solid #1f2937",
          background: "#0d1117",
          display: "flex", flexDirection: "column",
          overflow: "auto",
        }}>
          {/* Scrape Panel */}
          <div style={{ padding: 20, borderBottom: "1px solid #1f2937" }}>
            <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 14 }}>
              SCRAPER
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 5 }}>Kategorie</div>
                <select
                  value={scrapeCategory}
                  onChange={e => setScrapeCategory(e.target.value)}
                  style={inputStyle}
                >
                  {categories.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 5 }}>Stadt</div>
                <input
                  placeholder="z.B. Berlin"
                  value={scrapeCity}
                  onChange={e => setScrapeCity(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && triggerScrape()}
                  style={inputStyle}
                />
              </div>

              <button
                onClick={triggerScrape}
                disabled={scrapeStatus.status === "running"}
                style={{
                  background: scrapeStatus.status === "running"
                    ? "#1f2937"
                    : "linear-gradient(135deg, #3b82f6, #6366f1)",
                  color: scrapeStatus.status === "running" ? "#6b7280" : "#fff",
                  border: "none", borderRadius: 8,
                  padding: "10px 16px", fontSize: 13,
                  fontWeight: 700, cursor: scrapeStatus.status === "running" ? "not-allowed" : "pointer",
                  letterSpacing: "0.02em", marginTop: 4,
                  transition: "opacity 0.2s",
                }}
              >
                {scrapeStatus.status === "running" ? "⏳ Scraping..." : "🔍 Scrapen"}
              </button>

              {/* Scrape status */}
              {scrapeStatus.status !== "idle" && (
                <div style={{
                  fontSize: 11, color: "#6b7280",
                  background: "#111827", border: "1px solid #1f2937",
                  borderRadius: 8, padding: "8px 12px", lineHeight: 1.5,
                }}>
                  {scrapeStatus.status === "running" && "⏳ Läuft..."}
                  {scrapeStatus.status === "done" && (
                    <>✅ {scrapeStatus.found} gefunden<br />{scrapeStatus.saved} neu gespeichert</>
                  )}
                  {scrapeStatus.status === "error" && <span style={{ color: "#f87171" }}>❌ {scrapeStatus.message}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Category stats */}
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 14 }}>
              KATEGORIEN
            </div>
            {Object.entries(stats.byCategory || {}).map(([cat, count]) => (
              <div key={cat} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 0", borderBottom: "1px solid #0f172a",
                cursor: "pointer",
              }}
                onClick={() => setCatFilter(
                  categories.find(c => c.label === cat)?.key || ""
                )}
              >
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{cat}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#60a5fa",
                  background: "#1e3a5f", borderRadius: 10, padding: "1px 8px",
                  fontFamily: "'DM Mono', monospace",
                }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Stats row */}
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid #1f2937",
            display: "flex", gap: 12,
            background: "#0d1117",
          }}>
            <StatCard label="Gesamt" value={stats.total} color="#60a5fa" />
            <StatCard label="Konvertiert" value={stats.byStatus?.Converted || 0} color="#4ade80" />
            <StatCard label="Ausstehend" value={stats.byStatus?.Thinking || 0} color="#fb923c" />
            <StatCard label="Abgelehnt" value={stats.byStatus?.No || 0} color="#f87171" />
            <StatCard label="Neu" value={stats.byStatus?.New || 0} color="#a78bfa" />
          </div>

          {/* Filter bar */}
          <div style={{
            padding: "12px 24px",
            borderBottom: "1px solid #1f2937",
            display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
            background: "#0d1117",
          }}>
            <input
              placeholder="🔍 Name oder Adresse suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 240 }}
            />
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              style={{ ...inputStyle, width: 160 }}
            >
              <option value="">Alle Kategorien</option>
              {categories.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <input
              placeholder="Stadt filtern"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              style={{ ...inputStyle, width: 140 }}
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 140 }}
            >
              <option value="">Alle Status</option>
              <option value="New">Neu</option>
              <option value="Converted">Konvertiert</option>
              <option value="Thinking">Ausstehend</option>
              <option value="No">Abgelehnt</option>
            </select>
            {(catFilter || cityFilter || statusFilter || search) && (
              <button
                onClick={() => { setCatFilter(""); setCityFilter(""); setStatusFilter(""); setSearch(""); }}
                style={{
                  background: "transparent", border: "1px solid #374151",
                  color: "#6b7280", borderRadius: 7, padding: "7px 12px",
                  fontSize: 12, cursor: "pointer",
                }}
              >
                ✕ Reset
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>
              {total.toLocaleString()} Ergebnisse
            </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0d1117", position: "sticky", top: 0, zIndex: 10 }}>
                  {["Unternehmen", "Kontakte", "Adresse", "Öffnungszeiten", "Kategorie", "Status", "Aktionen"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      color: "#4b5563", textTransform: "uppercase",
                      borderBottom: "1px solid #1f2937",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "60px 24px", textAlign: "center", color: "#374151" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                      <div style={{ fontSize: 14, color: "#6b7280" }}>Keine Leads gefunden. Scraper starten!</div>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, i) => (
                    <tr
                      key={`${lead.Name}-${lead.City}-${i}`}
                      style={{
                        borderBottom: "1px solid #111827",
                        background: i % 2 === 0 ? "#0a0c10" : "#0d1117",
                        transition: "background 0.15s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#1a2035")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0a0c10" : "#0d1117")}
                    >
                      {/* Company */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>
                          <SourceTag source={lead.Source} />
                          {" "}{lead.Name}
                        </div>
                        {lead.Owner && lead.Owner !== "None" && (
                          <div style={{ fontSize: 11, color: "#6b7280" }}>👤 {lead.Owner}</div>
                        )}
                        <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{lead.City}</div>
                      </td>

                      {/* Phones */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <PhoneChip phone={lead.Phone1} />
                        <PhoneChip phone={lead.Phone2} />
                        <PhoneChip phone={lead.Phone3} />
                      </td>

                      {/* Address */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top", maxWidth: 200 }}>
                        <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: 1.5 }}>
                          {lead.Address !== "None" ? lead.Address : "—"}
                        </div>
                      </td>

                      {/* Opening hours */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top", maxWidth: 180 }}>
                        <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: 1.5 }}>
                          {lead.OpeningHours !== "None" ? lead.OpeningHours : "—"}
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <div style={{
                          fontSize: 11, color: "#a78bfa",
                          background: "#2e1065", borderRadius: 5,
                          padding: "2px 8px", display: "inline-block",
                          whiteSpace: "nowrap",
                        }}>
                          {lead.Category}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <StatusBadge status={lead.LeadStatus} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <ActionBtn
                            label="✓"
                            title="Konvertiert"
                            color="#22c55e"
                            onClick={() => updateStatus(lead, "Converted")}
                          />
                          <ActionBtn
                            label="⏸"
                            title="Ausstehend"
                            color="#f97316"
                            onClick={() => updateStatus(lead, "Thinking")}
                          />
                          <ActionBtn
                            label="✕"
                            title="Abgelehnt"
                            color="#ef4444"
                            onClick={() => updateStatus(lead, "No")}
                          />
                          <ActionBtn
                            label="⋯"
                            title="Details"
                            color="#6b7280"
                            onClick={() => setSelectedLead(lead)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: "12px 24px",
              borderTop: "1px solid #1f2937",
              display: "flex", gap: 6, alignItems: "center",
              background: "#0d1117",
            }}>
              <button
                onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchLeads(p); }}
                disabled={page === 1}
                style={pageBtn(page === 1)}
              >←</button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => { setPage(p); fetchLeads(p); }}
                  style={pageBtn(false, p === page)}
                >
                  {p}
                </button>
              ))}
              {totalPages > 10 && <span style={{ color: "#4b5563", fontSize: 12 }}>... {totalPages}</span>}
              <button
                onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchLeads(p); }}
                disabled={page === totalPages}
                style={pageBtn(page === totalPages)}
              >→</button>
            </div>
          )}
        </div>
      </div>

      {/* ===== DETAIL MODAL ===== */}
      {selectedLead && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setSelectedLead(null)}
        >
          <div
            style={{
              background: "#111827", border: "1px solid #374151",
              borderRadius: 16, padding: 32, width: "100%", maxWidth: 580,
              maxHeight: "85vh", overflow: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>
                  {selectedLead.Name}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {selectedLead.Category} · {selectedLead.City}
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                style={{ background: "transparent", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}
              >✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <DetailField label="Inhaber" value={selectedLead.Owner} />
              <DetailField label="Quelle" value={selectedLead.Source} />
              <DetailField label="Telefon 1" value={selectedLead.Phone1} isPhone />
              <DetailField label="Telefon 2" value={selectedLead.Phone2} isPhone />
              <DetailField label="Telefon 3" value={selectedLead.Phone3} isPhone />
              <DetailField label="Webseite" value={selectedLead.Website} />
            </div>

            <DetailField label="Adresse" value={selectedLead.Address} />
            <DetailField label="Öffnungszeiten" value={selectedLead.OpeningHours} />
            <DetailField label="Extras" value={selectedLead.Extras} />

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button
                onClick={() => { updateStatus(selectedLead, "Converted"); setSelectedLead(null); }}
                style={{ ...actionModalBtn, background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}
              >✓ Konvertiert</button>
              <button
                onClick={() => { updateStatus(selectedLead, "Thinking"); setSelectedLead(null); }}
                style={{ ...actionModalBtn, background: "#1c1917", color: "#fb923c", border: "1px solid #7c2d12" }}
              >⏸ Ausstehend</button>
              <button
                onClick={() => deleteLead(selectedLead)}
                style={{ ...actionModalBtn, background: "#1c0a0a", color: "#f87171", border: "1px solid #7f1d1d" }}
              >🗑 Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== SMALL COMPONENTS =====
function ActionBtn({ label, title, color, onClick }: {
  label: string; title: string; color: string; onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${color}33`,
        color,
        borderRadius: 6, width: 28, height: 28,
        fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}22`)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}

function DetailField({ label, value, isPhone }: { label: string; value: string; isPhone?: boolean }) {
  const isEmpty = !value || value === "None";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: 13, color: "#374151" }}>—</div>
      ) : isPhone ? (
        <a href={`tel:${value}`} style={{ fontSize: 13, color: "#60a5fa", textDecoration: "none" }}>{value}</a>
      ) : (
        <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>{value}</div>
      )}
    </div>
  );
}

// ===== STYLE HELPERS =====
const inputStyle: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1f2937",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  width: "100%",
};

const pageBtn = (disabled: boolean, active = false): React.CSSProperties => ({
  background: active ? "#3b82f6" : "#111827",
  border: `1px solid ${active ? "#3b82f6" : "#1f2937"}`,
  color: disabled ? "#374151" : active ? "#fff" : "#9ca3af",
  borderRadius: 6, padding: "5px 10px",
  fontSize: 12, cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: "'DM Mono', monospace",
});

const actionModalBtn: React.CSSProperties = {
  borderRadius: 8, padding: "9px 18px",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
