import type { WorkerEnv } from "@myform/config";
import { loadEnv, workerEnvSchema, type EnvSource } from "@myform/config";

export function readWorkerEnv(source: EnvSource = process.env as EnvSource): WorkerEnv {
  return loadEnv(workerEnvSchema, source);
}
