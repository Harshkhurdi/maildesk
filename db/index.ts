import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const state=globalThis as unknown as {maildeskPool?:Pool};
export function getDb(){if(!process.env.DATABASE_URL)throw Error("Maildesk database is not configured.");const pool=state.maildeskPool??=new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:15000});return drizzle(pool,{schema});}
