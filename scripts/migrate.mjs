import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
const connectionString=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!connectionString)throw Error('Maildesk database connection is missing.');
const pool=new Pool({connectionString,max:1});
try{await migrate(drizzle(pool),{migrationsFolder:"db/migrations"});console.log("Maildesk migrations applied.");}finally{await pool.end();}
