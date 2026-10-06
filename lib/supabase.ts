import { createClient } from "@supabase/supabase-js";

export type RecordTable = "productions" | "products" | "employees";

const storageKeys: Record<RecordTable, string> = {
  productions: "protrack-productions",
  products: "protrack-products",
  employees: "protrack-employees",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigError =
  Boolean(url) !== Boolean(anonKey)
    ? "Both Supabase environment variables must be configured."
    : "";
export const supabaseConfigured = Boolean(url && anonKey);

const supabase =
  supabaseConfigured && url && anonKey ? createClient(url, anonKey) : null;

function readLocalRecords<T>(table: RecordTable): T[] {
  if (typeof window === "undefined") return [];

  const value = window.localStorage.getItem(storageKeys[table]);
  if (!value) return [];
  const records: unknown = JSON.parse(value);
  if (!Array.isArray(records)) {
    throw new Error(`Local ${table} data is not a valid record list.`);
  }
  return records as T[];
}

function writeLocalRecords<T>(table: RecordTable, records: T[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKeys[table], JSON.stringify(records));
  }
}

function requireSupabase() {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function assertValidConfiguration() {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
}

export async function readRecords<T extends { id: string }>(
  table: RecordTable,
): Promise<T[]> {
  assertValidConfiguration();
  if (!supabaseConfigured) return readLocalRecords<T>(table);

  const client = requireSupabase();
  const { data, error } = await client
    .from(table)
    .select("id, record");

  if (error) throw error;
  const records = data.map((row) => row.record as T);

  if (records.length === 0) {
    const localRecords = readLocalRecords<T>(table);
    if (localRecords.length > 0) {
      const { error: migrationError } = await client.from(table).upsert(
        localRecords.map((record) => ({ id: record.id, record })),
      );
      if (migrationError) throw migrationError;
      return localRecords;
    }
  }

  return records;
}

export async function saveRecord<T extends { id: string }>(
  table: RecordTable,
  record: T,
) {
  assertValidConfiguration();
  if (supabaseConfigured) {
    const { error } = await requireSupabase()
      .from(table)
      .upsert({ id: record.id, record });
    if (error) throw error;
    return;
  }

  const records = readLocalRecords<T>(table);
  const updatedRecords = [
    record,
    ...records.filter((item) => item.id !== record.id),
  ];
  writeLocalRecords(table, updatedRecords);
}

export async function deleteRecord(table: RecordTable, id: string) {
  assertValidConfiguration();
  if (supabaseConfigured) {
    const { error } = await requireSupabase()
      .from(table)
      .delete()
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const records = readLocalRecords<{ id: string }>(table);
  writeLocalRecords(table, records.filter((record) => record.id !== id));
}

export function subscribeToRecords<T extends { id: string }>(
  table: RecordTable,
  onRecords: (records: T[]) => void,
  onError: (error: unknown) => void,
) {
  assertValidConfiguration();
  if (!supabaseConfigured) return () => {};

  const channel = requireSupabase()
    .channel(`public:${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        void readRecords<T>(table).then(onRecords).catch(onError);
      },
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError(error ?? new Error(`Supabase realtime ${status.toLowerCase()}.`));
      }
    });

  return () => {
    void requireSupabase().removeChannel(channel);
  };
}
