"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  deleteRecord,
  readRecords,
  saveRecord,
  subscribeToRecords,
  supabaseConfigError,
  supabaseConfigured,
} from "@/lib/supabase";
import type {
  Employee,
  Product,
  Production,
  ProductionStatus,
} from "@/lib/types";

type Tab = "Dashboard" | "Products" | "Employees" | "Reports";
type Toast = { id: number; type: "success" | "error" | "info"; message: string };
const tabs: Array<[string, Tab]> = [
  ["◈", "Dashboard"],
  ["□", "Products"],
  ["♙", "Employees"],
  ["▤", "Reports"],
];
function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function currentTimes(production: Production, now: number) {
  return {
    active:
      production.activeTime +
      (production.status === "Active" && production.lastStartTimer
        ? now - production.lastStartTimer
        : 0),
    breakTime:
      production.breakTime +
      (production.status === "Paused" && production.lastPauseTimer
        ? now - production.lastPauseTimer
        : 0),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [productions, setProductions] = useState<Production[]>([]);
  const [now, setNow] = useState(Date.now);
  const [darkMode, setDarkMode] = useState(true);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [newProduction, setNewProduction] = useState({
    name: "",
    qty: "1",
    employee: "",
    supervisor: "",
  });
  const [completionTarget, setCompletionTarget] = useState<Production | null>(
    null,
  );
  const [completionNotes, setCompletionNotes] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [productName, setProductName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] =
    useState<Employee["role"]>("Employee");
  const [reportStatus, setReportStatus] = useState<ProductionStatus | "All">(
    "All",
  );
  const [reportDate, setReportDate] = useState("");
  const [syncError, setSyncError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  function notify(message: string, type: Toast["type"] = "success") {
    const id = new Date().getTime();
    setToasts((items) => [...items, { id, type, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  }

  useEffect(() => {
    if (supabaseConfigError) return;

    let active = true;
    const reportLoadError = (error: unknown) => {
      if (active) setSyncError(`Data sync error: ${errorMessage(error)}`);
    };
    const unsubscribe = [
      subscribeToRecords<Production>("productions", setProductions, reportLoadError),
      subscribeToRecords<Product>("products", setProducts, reportLoadError),
      subscribeToRecords<Employee>("employees", setEmployees, reportLoadError),
    ];

    void Promise.all([
      readRecords<Production>("productions"),
      readRecords<Product>("products"),
      readRecords<Employee>("employees"),
    ])
      .then(([loadedProductions, loadedProducts, loadedEmployees]) => {
        if (!active) return;
        setProductions(loadedProductions);
        setProducts(loadedProducts);
        setEmployees(loadedEmployees);
        setSyncError("");
      })
      .catch(reportLoadError);

    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const queue = useMemo(
    () =>
      productions
        .filter((item) => item.status !== "Completed")
        .sort((a, b) => b.id.localeCompare(a.id)),
    [productions],
  );

  async function persist(
    production: Production,
    successMessage = "Production updated successfully",
  ) {
    try {
      await saveRecord("productions", production);
      setProductions((items) =>
        items.map((item) => (item.id === production.id ? production : item)),
      );
      setSyncError("");
      notify(successMessage);
      return true;
    } catch (error) {
      setSyncError(`Unable to save production: ${errorMessage(error)}`);
      notify("Unable to save production.", "error");
      return false;
    }
  }
  async function action(
    production: Production,
    actionName: "start" | "pause" | "resume" | "delete",
  ) {
    if (actionName === "delete") {
      try {
        await deleteRecord("productions", production.id);
        setProductions((items) =>
          items.filter((item) => item.id !== production.id),
        );
        setSyncError("");
        notify("Production deleted successfully");
      } catch (error) {
        setSyncError(`Unable to delete production: ${errorMessage(error)}`);
        notify("Unable to delete production.", "error");
      }
      return;
    }
    const timestamp = new Date().getTime();
    const next: Production = { ...production };
    if (actionName === "start") {
      next.status = "Active";
      next.lastStartTimer = timestamp;
    }
    if (actionName === "pause") {
      next.activeTime += timestamp - (next.lastStartTimer ?? timestamp);
      next.status = "Paused";
      next.lastPauseTimer = timestamp;
      next.lastStartTimer = null;
    }
    if (actionName === "resume") {
      next.breakTime += timestamp - (next.lastPauseTimer ?? timestamp);
      next.status = "Active";
      next.lastStartTimer = timestamp;
      next.lastPauseTimer = null;
    }
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
    const saved = await persist(
      {
        ...production,
        activeTime: times.active,
        breakTime: times.breakTime,
        status: "Completed" as ProductionStatus,
        notes: completionNotes.trim(),
        lastStartTimer: null,
        lastPauseTimer: null,
      },
      "Production completed successfully",
    );
    if (!saved) return;
    setCompletionTarget(null);
    setCompletionNotes("");
  }
  async function createProduction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const production: Production = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      name: newProduction.name.trim(),
      qty: Number(newProduction.qty),
      employee: newProduction.employee.trim() || "Unassigned",
      supervisor: newProduction.supervisor.trim() || "Unassigned",
      status: "Pending",
      activeTime: 0,
      breakTime: 0,
      lastStartTimer: null,
      lastPauseTimer: null,
      notes: "",
    };
    try {
      await saveRecord("productions", production);
      setProductions((items) => [production, ...items]);
      setSyncError("");
      notify("Production added to queue");
    } catch (error) {
      setSyncError(`Unable to save production: ${errorMessage(error)}`);
      notify("Unable to save production.", "error");
      return;
    }
    setNewProduction({ name: "", qty: "1", employee: "", supervisor: "" });
    setShowProductionForm(false);
  }
  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const product: Product = {
      id: crypto.randomUUID(),
      name: productName.trim(),
      image: "",
    };
    try {
      await saveRecord("products", product);
      setProducts((items) => [product, ...items]);
      setSyncError("");
      notify("Product saved successfully");
    } catch (error) {
      setSyncError(`Unable to save product: ${errorMessage(error)}`);
      notify("Unable to save product.", "error");
      return;
    }
    setProductName("");
  }
  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employee: Employee = {
      id: crypto.randomUUID(),
      name: employeeName.trim(),
      role: employeeRole,
    };
    try {
      await saveRecord("employees", employee);
      setEmployees((items) => [employee, ...items]);
      setSyncError("");
      notify("Employee saved successfully");
    } catch (error) {
      setSyncError(`Unable to save employee: ${errorMessage(error)}`);
      notify("Unable to save employee.", "error");
      return;
    }
    setEmployeeName("");
  }
  async function removeRecord(type: "products" | "employees", id: string) {
    try {
      if (type === "products") {
        await deleteRecord("products", id);
        setProducts((items) => items.filter((item) => item.id !== id));
      } else {
        await deleteRecord("employees", id);
        setEmployees((items) => items.filter((item) => item.id !== id));
      }
      setSyncError("");
      notify(`${type === "products" ? "Product" : "Employee"} deleted successfully`);
    } catch (error) {
      setSyncError(`Unable to delete record: ${errorMessage(error)}`);
      notify("Unable to delete record.", "error");
    }
  }
  const reportRows = useMemo(
    () =>
      productions
        .filter(
          (item) =>
            (reportStatus === "All" || item.status === reportStatus) &&
            (!reportDate || item.date === reportDate),
        )
        .sort((first, second) => {
          const employeeOrder = first.employee.localeCompare(second.employee, undefined, { sensitivity: "base" });
          if (employeeOrder !== 0) return employeeOrder;
          const dateOrder = second.date.localeCompare(first.date);
          return dateOrder !== 0 ? dateOrder : second.id.localeCompare(first.id);
        }),
    [productions, reportDate, reportStatus],
  );
  function exportReport() {
    const pdf = new jsPDF({ orientation: "landscape" });
    pdf.setFontSize(18);
    pdf.text("ProTrack Production Report", 14, 18);
    const employeeGroups = reportRows.reduce<Record<string, Production[]>>(
      (groups, item) => {
        (groups[item.employee] ??= []).push(item);
        return groups;
      },
      {},
    );
    let tableStart = 28;
    Object.entries(employeeGroups).forEach(([employee, employeeRows]) => {
      if (tableStart > 270) {
        pdf.addPage();
        tableStart = 20;
      }
      pdf.setFontSize(13);
      pdf.setTextColor(49, 92, 157);
      pdf.text(`Employee: ${employee}`, 14, tableStart);
      pdf.setTextColor(0, 0, 0);
      tableStart += 6;
      let totalActive = 0;
      let totalBreak = 0;
      let totalQuantity = 0;
      autoTable(pdf, {
        startY: tableStart,
        head: [["Date", "Product", "Qty", "Supervisor", "Production", "Break", "Total", "Status", "Notes"]],
        body: employeeRows.map((item) => {
          const times = currentTimes(item, Date.now());
          totalActive += times.active;
          totalBreak += times.breakTime;
          totalQuantity += item.qty;
          return [item.date, item.name, item.qty, item.supervisor, formatTime(times.active), formatTime(times.breakTime), formatTime(times.active + times.breakTime), item.status, item.notes || "-"];
        }),
      });
      tableStart = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      if (tableStart > 275) {
        pdf.addPage();
        tableStart = 20;
      }
      pdf.setFontSize(10);
      pdf.setTextColor(24, 33, 47);
      pdf.text(`Total Production Quantity: ${totalQuantity}`, 14, tableStart);
      pdf.text(`Total Production Time: ${formatTime(totalActive)}`, 100, tableStart);
      pdf.text(`Total Break Time: ${formatTime(totalBreak)}`, 205, tableStart);
      tableStart += 13;
    });
    pdf.save(`ProTrack_Report_${Date.now()}.pdf`);
    notify("PDF report downloaded successfully");
  }

  return (
    <div className={darkMode ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PT</span>
          <span>ProTrack</span>
        </div>
        <nav className="nav-list" aria-label="Primary navigation">
          {tabs.map(([icon, label]) => (
            <button
              className={activeTab === label ? "nav-item active" : "nav-item"}
              key={label}
              onClick={() => setActiveTab(label)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <button
          className="theme-toggle"
          onClick={() => setDarkMode((value) => !value)}
        >
          {darkMode ? "☼  Light mode" : "◐  Dark mode"}
        </button>
      </aside>
      <main className="main-content">
        {activeTab === "Dashboard" && (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">Operations / Today</p>
                <h1>Live production</h1>
                <p className="muted">
                  Keep every line moving with a clear view of what is happening
                  now.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setShowProductionForm(true)}
              >
                ＋ Start production
              </button>
            </header>
            <section className="metric-strip">
              <div>
                <span className="metric-label">Queue</span>
                <strong>{queue.length}</strong>
                <span className="metric-note">open entries</span>
              </div>
              <div>
                <span className="metric-label">Running</span>
                <strong>
                  {queue.filter((item) => item.status === "Active").length}
                </strong>
                <span className="metric-note">on the floor</span>
              </div>
              <div>
                <span className="metric-label">System</span>
                <strong className="online">Live</strong>
                <span className="metric-note">
                  {supabaseConfigError ||
                    syncError ||
                    (supabaseConfigured
                      ? "Supabase shared sync"
                      : "Local storage active")}
                </span>
              </div>
            </section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Production queue</p>
                <h2>Today&apos;s work</h2>
              </div>
              <span className="live-pill">
                <i /> Live updates
              </span>
            </div>
            <section className="production-grid">
              {queue.map((production) => {
                const times = currentTimes(production, now);
                return (
                  <article className="production-card" key={production.id}>
                    <div className="card-top">
                      <span
                        className={`status ${production.status.toLowerCase()}`}
                      >
                        {production.status}
                      </span>
                      <span className="date-label">{production.date}</span>
                    </div>
                    <h3>{production.name}</h3>
                    <div className="details">
                      <span>
                        Quantity <b>{production.qty}</b>
                      </span>
                      <span>
                        Employee <b>{production.employee}</b>
                      </span>
                    </div>
                    <div className="timer-panel">
                      <div>
                        <span>Active time</span>
                        <strong className="active-time">
                          {formatTime(times.active)}
                        </strong>
                      </div>
                      <div>
                        <span>Break time</span>
                        <strong className="break-time">
                          {formatTime(times.breakTime)}
                        </strong>
                      </div>
                    </div>
                    <div className="card-actions">
                      {production.status === "Pending" && (
                        <button
                          className="primary-button small"
                          onClick={() => action(production, "start")}
                        >
                          ▶ Start timer
                        </button>
                      )}
                      {production.status === "Active" && (
                        <button
                          className="warning-button"
                          onClick={() => action(production, "pause")}
                        >
                          Ⅱ Pause
                        </button>
                      )}
                      {production.status === "Paused" && (
                        <button
                          className="primary-button small"
                          onClick={() => action(production, "resume")}
                        >
                          ▶ Resume
                        </button>
                      )}
                      {production.status !== "Pending" && (
                        <button
                          className="success-button"
                          onClick={() => complete(production)}
                        >
                          ✓ Complete
                        </button>
                      )}
                      {production.status === "Pending" && (
                        <button
                          className="icon-button"
                          aria-label="Delete production"
                          onClick={() => action(production, "delete")}
                        >
                          ⌫
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
        {activeTab === "Products" && (
          <section className="directory-view">
            <div className="page-header">
              <div>
                <p className="eyebrow">Workspace / Products</p>
                <h1>Products</h1>
                <p className="muted">Manage your product catalogue.</p>
              </div>
            </div>
            <form className="inline-form" onSubmit={saveProduct}>
              <input
                required
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="Product name"
              />
              <button className="primary-button" type="submit">
                ＋ Add product
              </button>
            </form>
            <div className="record-grid">
              {products.map((product) => (
                <article className="record-card" key={product.id}>
                  <div>
                    <span className="record-icon">□</span>
                    <h3>{product.name}</h3>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${product.name}`}
                    onClick={() => removeRecord("products", product.id)}
                  >
                    ⌫
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {activeTab === "Employees" && (
          <section className="directory-view">
            <div className="page-header">
              <div>
                <p className="eyebrow">Workspace / Employees</p>
                <h1>Employees</h1>
                <p className="muted">Manage employees and supervisors.</p>
              </div>
            </div>
            <form className="inline-form" onSubmit={saveEmployee}>
              <input
                required
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
                placeholder="Employee name"
              />
              <select
                value={employeeRole}
                onChange={(event) =>
                  setEmployeeRole(event.target.value as Employee["role"])
                }
              >
                <option>Employee</option>
                <option>Supervisor</option>
              </select>
              <button className="primary-button" type="submit">
                ＋ Add employee
              </button>
            </form>
            <div className="record-grid">
              {employees.map((employee) => (
                <article className="record-card" key={employee.id}>
                  <div>
                    <span className="record-icon">♙</span>
                    <h3>{employee.name}</h3>
                    <p className="muted">{employee.role}</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${employee.name}`}
                    onClick={() => removeRecord("employees", employee.id)}
                  >
                    ⌫
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {activeTab === "Reports" && (
          <section className="directory-view">
            <div className="page-header">
              <div>
                <p className="eyebrow">Workspace / Reports</p>
                <h1>Reports</h1>
                <p className="muted">
                  Filter production history and export a landscape PDF.
                </p>
              </div>
              <button className="primary-button" onClick={exportReport}>
                ↓ Export PDF
              </button>
            </div>
            <div className="inline-form report-filters">
              <input
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
              <select
                value={reportStatus}
                onChange={(event) =>
                  setReportStatus(
                    event.target.value as ProductionStatus | "All",
                  )
                }
              >
                <option>All</option>
                <option>Pending</option>
                <option>Active</option>
                <option>Paused</option>
                <option>Completed</option>
              </select>
            </div>
            <div className="report-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Employee</th>
                    <th>Production</th>
                    <th>Break</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((item) => {
                    const times = currentTimes(item, now);
                    return (
                      <tr key={item.id}>
                        <td>{item.date}</td>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.qty}</td>
                        <td>{item.employee}</td>
                        <td>{formatTime(times.active)}</td>
                        <td>{formatTime(times.breakTime)}</td>
                        <td>
                          <span
                            className={`status ${item.status.toLowerCase()}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td>{item.notes || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {showProductionForm && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setShowProductionForm(false)}
          >
            <form
              className="production-form"
              onSubmit={createProduction}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="form-heading">
                <div>
                  <p className="eyebrow">New entry</p>
                  <h2>Start production</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close form"
                  onClick={() => setShowProductionForm(false)}
                >
                  ×
                </button>
              </div>
              <label>
                Product name
                <input
                  required
                  list="saved-products"
                  value={newProduction.name}
                  onChange={(event) =>
                    setNewProduction({
                      ...newProduction,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Precision brackets"
                />
              </label>
              <div className="form-row">
                <label>
                  Quantity
                  <input
                    required
                    min="1"
                    type="number"
                    value={newProduction.qty}
                    onChange={(event) =>
                      setNewProduction({
                        ...newProduction,
                        qty: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Employee
                  <input
                    list="saved-employees"
                    value={newProduction.employee}
                    onChange={(event) =>
                      setNewProduction({
                        ...newProduction,
                        employee: event.target.value,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label>
                Supervisor
                <input
                  list="saved-supervisors"
                  value={newProduction.supervisor}
                  onChange={(event) =>
                    setNewProduction({
                      ...newProduction,
                      supervisor: event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </label>
              <datalist id="saved-products">
                {products.map((product) => (
                  <option key={product.id} value={product.name} />
                ))}
              </datalist>
              <datalist id="saved-employees">
                {employees
                  .filter((employee) => employee.role === "Employee")
                  .map((employee) => (
                    <option key={employee.id} value={employee.name} />
                  ))}
              </datalist>
              <datalist id="saved-supervisors">
                {employees
                  .filter((employee) => employee.role === "Supervisor")
                  .map((employee) => (
                    <option key={employee.id} value={employee.name} />
                  ))}
              </datalist>
              <button className="primary-button" type="submit">
                Add to queue
              </button>
            </form>
          </div>
        )}
        {completionTarget && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setCompletionTarget(null)}
          >
            <form
              className="production-form"
              onSubmit={submitCompletion}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="form-heading">
                <div>
                  <p className="eyebrow">Finish entry</p>
                  <h2>Submit production notes</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close notes"
                  onClick={() => setCompletionTarget(null)}
                >
                  ×
                </button>
              </div>
              <p className="muted">
                Add a short note for <strong>{completionTarget.name}</strong>{" "}
                before marking it complete.
              </p>
              <label>
                Completion notes
                <textarea
                  required
                  rows={5}
                  value={completionNotes}
                  onChange={(event) => setCompletionNotes(event.target.value)}
                  placeholder="What was produced? Any quality or shift notes?"
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCompletionTarget(null)}
                >
                  Cancel
                </button>
                <button className="success-button" type="submit">
                  ✓ Submit &amp; complete
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div className={`toast ${toast.type}`} key={toast.id}>
              <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
              {toast.message}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
