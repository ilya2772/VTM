import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const postgresPort = process.env.AXIOM_E2E_POSTGRES_PORT ?? "55439";
const databaseName = "axiom_e2e";

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

export default async function globalSetup() {
  const dataDirectory = await mkdtemp(join(tmpdir(), "axiom-e2e-postgres-"));
  const postgresLog = join(dataDirectory, "postgres.log");
  let started = false;
  try {
    run("initdb", ["-D", dataDirectory, "-A", "trust", "-U", "postgres"]);
    run("pg_ctl", [
      "-D",
      dataDirectory,
      "-l",
      postgresLog,
      "-o",
      `-p ${postgresPort} -h 127.0.0.1`,
      "-w",
      "start",
    ]);
    started = true;
    const databaseUrl = `postgresql://postgres@127.0.0.1:${postgresPort}/${databaseName}?schema=public`;
    const databaseEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PGHOST: "127.0.0.1",
      PGPORT: postgresPort,
      PGUSER: "postgres",
    };
    run("createdb", [databaseName], databaseEnvironment);
    run("pnpm", ["exec", "prisma", "migrate", "deploy"], databaseEnvironment);
    run("pnpm", ["exec", "prisma", "db", "seed"], databaseEnvironment);

    return async () => {
      run("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
      await rm(dataDirectory, { recursive: true, force: true });
    };
  } catch (error) {
    const log = await readFile(postgresLog, "utf8").catch(() => "");
    if (started) {
      spawnSync("pg_ctl", [
        "-D",
        dataDirectory,
        "-m",
        "immediate",
        "-w",
        "stop",
      ]);
    }
    await rm(dataDirectory, { recursive: true, force: true });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${log}`,
    );
  }
}
