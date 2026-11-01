import {
  loadEnv,
  pickWorkerEnv,
  workerEnvSchema,
  type EnvSource,
  type WorkerEnv,
} from "@myform/config";

export function readWorkerEnv(source: EnvSource = process.env as EnvSource): WorkerEnv {
  return loadEnv(workerEnvSchema, pickWorkerEnv(source));
}
