export type ProductionStatus = "Pending" | "Active" | "Paused" | "Completed";

export type Production = {
  id: string;
  date: string;
  name: string;
  qty: number;
  employee: string;
  supervisor: string;
  status: ProductionStatus;
  activeTime: number;
  breakTime: number;
  lastStartTimer: number | null;
  lastPauseTimer: number | null;
  notes: string;
};

export type Product = { id: string; name: string; image: string };
export type Employee = { id: string; name: string; role: "Employee" | "Supervisor" };