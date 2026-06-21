import PgBoss from "pg-boss";

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export const getBoss = async () => {
  if (boss) return boss;
  if (starting) return starting;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to start the job queue.");
  }

  const instance = new PgBoss({
    connectionString,
    // Keep these lightweight; production overrides can be added later.
    monitorStateIntervalSeconds: 0,
  });

  starting = instance.start().then(() => {
    boss = instance;
    return instance;
  });

  return starting;
};
