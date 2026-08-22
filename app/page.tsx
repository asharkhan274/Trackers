"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Production, ProductionStatus } from "@/lib/types";

type Tab = "Dashboard" | "Products" | "Employees" | "Reports";
const tabs: Array<[string, Tab]> = [["◈", "Dashboard"], ["□", "Products"], ["♙", "Employees"], ["▤", "Reports"]];
const productionCollection = db ? collection(db, "productions") : null;
const demoProductions: Production[] = [
  { id: "demo-1", date: new Date().toISOString().slice(0, 10), name: "Assembly batch A", qty: 24, employee: "Awaiting assignment", supervisor: "Awaiting assignment", status: "Pending", activeTime: 0, breakTime: 0, lastStartTimer: null, lastPauseTimer: null, notes: "" },
  { id: "demo-2", date: new Date().toISOString().slice(0, 10), name: "Precision brackets", qty: 12, employee: "Maya Chen", supervisor: "Jon Bell", status: "Active", activeTime: 28 * 60 * 1000, breakTime: 4 * 60 * 1000, lastStartTimer: Date.now() - 7 * 60 * 1000, lastPauseTimer: null, notes: "" },
];

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

function currentTimes(production: Production, now: number) {
  return {
    active: production.activeTime + (production.status === "Active" && production.lastStartTimer ? now - production.lastStartTimer : 0),
    breakTime: production.breakTime + (production.status === "Paused" && production.lastPauseTimer ? now - production.lastPauseTimer : 0),
  };
}

function EmptyView({ tab }: { tab: Exclude<Tab, "Dashboard"> }) {
  const descriptions = { Products: "Your product catalogue will appear here.", Employees: "Manage employees and supervisors from this directory.", Reports: "Completed production reports will appear here." };
  return <section className="directory-view"><p className="eyebrow">Workspace / {tab}</p><h1>{tab}</h1><p className="muted">{descriptions[tab]}</p><div className="empty-panel"><span className="empty-icon">{tab === "Products" ? "□" : tab === "Employees" ? "♙" : "▤"}</span><h2>{tab} module ready</h2><p className="muted">This section is now connected to the sidebar. The data forms and report export are the next implementation step.</p></div></section>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [productions, setProductions] = useState<Production[]>(demoProductions);
  const [now, setNow] = useState(Date.now);
  const [darkMode, setDarkMode] = useState(true);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [newProduction, setNewProduction] = useState({ name: "", qty: "1", employee: "", supervisor: "" });
  const [completionTarget, setCompletionTarget] = useState<Production | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");

  useEffect(() => {
    if (!productionCollection) return;
    return onSnapshot(productionCollection, (snapshot) => setProductions(snapshot.docs.map((item) => item.data() as Production)));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const queue = useMemo(() => productions.filter((item) => item.status !== "Completed").sort((a, b) => b.id.localeCompare(a.id)), [productions]);

  async function persist(production: Production) {
    if (db) await setDoc(doc(db, "productions", production.id), production);
    else setProductions((items) => items.map((item) => item.id === production.id ? production : item));
  }
  async function action(production: Production, actionName: "start" | "pause" | "resume" | "delete") {
    if (actionName === "delete") { if (db) await deleteDoc(doc(db, "productions", production.id)); else setProductions((items) => items.filter((item) => item.id !== production.id)); return; }
    const timestamp = new Date().getTime();
    const next: Production = { ...production };
    if (actionName === "start") { next.status = "Active"; next.lastStartTimer = timestamp; }
    if (actionName === "pause") { next.activeTime += timestamp - (next.lastStartTimer ?? timestamp); next.status = "Paused"; next.lastPauseTimer = timestamp; next.lastStartTimer = null; }
    if (actionName === "resume") { next.breakTime += timestamp - (next.lastPauseTimer ?? timestamp); next.status = "Active"; next.lastStartTimer = timestamp; next.lastPauseTimer = null; }
    await persist(next);
  }
  async function complete(production: Production) {
    setCompletionTarget(production);
    setCompletionNotes("");
  }
  async function submitCompletion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionTarget || !completionNotes.trim()) return;
    const production = completionTarget;
    const times = currentTimes(production, Date.now());
    await persist({ ...production, activeTime: times.active, breakTime: times.breakTime, status: "Completed" as ProductionStatus, notes: completionNotes.trim(), lastStartTimer: null, lastPauseTimer: null });
    setCompletionTarget(null);
    setCompletionNotes("");
  }
  async function createProduction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const production: Production = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), name: newProduction.name.trim(), qty: Number(newProduction.qty), employee: newProduction.employee.trim() || "Unassigned", supervisor: newProduction.supervisor.trim() || "Unassigned", status: "Pending", activeTime: 0, breakTime: 0, lastStartTimer: null, lastPauseTimer: null, notes: "" };
    if (db) await setDoc(doc(db, "productions", production.id), production);
    else setProductions((items) => [production, ...items]);
    setNewProduction({ name: "", qty: "1", employee: "", supervisor: "" });
    setShowProductionForm(false);
  }

  return <div className={darkMode ? "app-shell dark" : "app-shell"}>
    <aside className="sidebar"><div className="brand"><span className="brand-mark">PT</span><span>ProTrack</span></div><nav className="nav-list" aria-label="Primary navigation">{tabs.map(([icon, label]) => <button className={activeTab === label ? "nav-item active" : "nav-item"} key={label} onClick={() => setActiveTab(label)}><span>{icon}</span>{label}</button>)}</nav><button className="theme-toggle" onClick={() => setDarkMode((value) => !value)}>{darkMode ? "☼  Light mode" : "◐  Dark mode"}</button></aside>
    <main className="main-content">
      {activeTab === "Dashboard" && <><header className="page-header"><div><p className="eyebrow">Operations / Today</p><h1>Live production</h1><p className="muted">Keep every line moving with a clear view of what is happening now.</p></div><button className="primary-button" onClick={() => setShowProductionForm(true)}>＋ Start production</button></header><section className="metric-strip"><div><span className="metric-label">Queue</span><strong>{queue.length}</strong><span className="metric-note">open entries</span></div><div><span className="metric-label">Running</span><strong>{queue.filter((item) => item.status === "Active").length}</strong><span className="metric-note">on the floor</span></div><div><span className="metric-label">System</span><strong className="online">Live</strong><span className="metric-note">Firestore sync</span></div></section><div className="section-heading"><div><p className="eyebrow">Production queue</p><h2>Today&apos;s work</h2></div><span className="live-pill"><i /> Live updates</span></div><section className="production-grid">{queue.map((production) => { const times = currentTimes(production, now); return <article className="production-card" key={production.id}><div className="card-top"><span className={`status ${production.status.toLowerCase()}`}>{production.status}</span><span className="date-label">{production.date}</span></div><h3>{production.name}</h3><div className="details"><span>Quantity <b>{production.qty}</b></span><span>Employee <b>{production.employee}</b></span></div><div className="timer-panel"><div><span>Active time</span><strong className="active-time">{formatTime(times.active)}</strong></div><div><span>Break time</span><strong className="break-time">{formatTime(times.breakTime)}</strong></div></div><div className="card-actions">{production.status === "Pending" && <button className="primary-button small" onClick={() => action(production, "start")}>▶ Start timer</button>}{production.status === "Active" && <button className="warning-button" onClick={() => action(production, "pause")}>Ⅱ Pause</button>}{production.status === "Paused" && <button className="primary-button small" onClick={() => action(production, "resume")}>▶ Resume</button>}{production.status !== "Pending" && <button className="success-button" onClick={() => complete(production)}>✓ Complete</button>}{production.status === "Pending" && <button className="icon-button" aria-label="Delete production" onClick={() => action(production, "delete")}>⌫</button>}</div></article>; })}</section></>}
      {activeTab !== "Dashboard" && <EmptyView tab={activeTab} />}
      {showProductionForm && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowProductionForm(false)}><form className="production-form" onSubmit={createProduction} onMouseDown={(event) => event.stopPropagation()}><div className="form-heading"><div><p className="eyebrow">New entry</p><h2>Start production</h2></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setShowProductionForm(false)}>×</button></div><label>Product name<input required value={newProduction.name} onChange={(event) => setNewProduction({ ...newProduction, name: event.target.value })} placeholder="e.g. Precision brackets" /></label><div className="form-row"><label>Quantity<input required min="1" type="number" value={newProduction.qty} onChange={(event) => setNewProduction({ ...newProduction, qty: event.target.value })} /></label><label>Employee<input value={newProduction.employee} onChange={(event) => setNewProduction({ ...newProduction, employee: event.target.value })} placeholder="Optional" /></label></div><label>Supervisor<input value={newProduction.supervisor} onChange={(event) => setNewProduction({ ...newProduction, supervisor: event.target.value })} placeholder="Optional" /></label><button className="primary-button" type="submit">Add to queue</button></form></div>}
      {completionTarget && <div className="modal-backdrop" role="presentation" onMouseDown={() => setCompletionTarget(null)}><form className="production-form" onSubmit={submitCompletion} onMouseDown={(event) => event.stopPropagation()}><div className="form-heading"><div><p className="eyebrow">Finish entry</p><h2>Submit production notes</h2></div><button type="button" className="icon-button" aria-label="Close notes" onClick={() => setCompletionTarget(null)}>×</button></div><p className="muted">Add a short note for <strong>{completionTarget.name}</strong> before marking it complete.</p><label>Completion notes<textarea required rows={5} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} placeholder="What was produced? Any quality or shift notes?" /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setCompletionTarget(null)}>Cancel</button><button className="success-button" type="submit">✓ Submit &amp; complete</button></div></form></div>}
    </main>
  </div>;
}