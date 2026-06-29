import { db } from "@workspace/db";
import { waAuthStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

async function readData(key: string): Promise<any> {
  try {
    const rows = await db.select().from(waAuthStateTable).where(eq(waAuthStateTable.key, key)).limit(1);
    if (!rows[0]) return null;
    const baileys = await import("@whiskeysockets/baileys");
    const { BufferJSON } = baileys as any;
    return JSON.parse(rows[0].value, BufferJSON.reviver);
  } catch {
    return null;
  }
}

async function writeData(key: string, data: any): Promise<void> {
  const baileys = await import("@whiskeysockets/baileys");
  const { BufferJSON } = baileys as any;
  const value = JSON.stringify(data, BufferJSON.replacer);
  await db
    .insert(waAuthStateTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: waAuthStateTable.key,
      set: { value, updatedAt: new Date() },
    });
}

async function removeData(key: string): Promise<void> {
  await db.delete(waAuthStateTable).where(eq(waAuthStateTable.key, key));
}

export async function clearAuthState(): Promise<void> {
  await db.delete(waAuthStateTable);
  logger.info("WA auth state cleared from DB");
}

export async function hasAuthState(): Promise<boolean> {
  const rows = await db.select({ key: waAuthStateTable.key }).from(waAuthStateTable).where(eq(waAuthStateTable.key, "creds")).limit(1);
  return rows.length > 0;
}

export async function usePostgresAuthState() {
  const baileys = await import("@whiskeysockets/baileys");
  const { initAuthCreds } = baileys as any;

  let creds = await readData("creds");
  if (!creds) {
    creds = initAuthCreds();
  }

  const keys = {
    get: async (type: string, ids: string[]) => {
      const result: Record<string, any> = {};
      await Promise.all(
        ids.map(async (id) => {
          const val = await readData(`${type}:${id}`);
          if (val != null) result[id] = val;
        })
      );
      return result;
    },
    set: async (data: Record<string, Record<string, any>>) => {
      const tasks: Promise<void>[] = [];
      for (const category of Object.keys(data)) {
        for (const id of Object.keys(data[category])) {
          const value = (data as any)[category][id];
          const key = `${category}:${id}`;
          if (value != null) {
            tasks.push(writeData(key, value));
          } else {
            tasks.push(removeData(key));
          }
        }
      }
      await Promise.all(tasks);
    },
    transaction: async (cb: () => Promise<void>) => {
      await cb();
    },
    isInTransaction: () => false,
  };

  return {
    state: { creds, keys },
    saveCreds: async () => {
      await writeData("creds", creds);
    },
  };
}
