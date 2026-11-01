#!/usr/bin/env node
/**
 * Build a Vercel Build Output API deployment for the NestJS API
 * (`vercel deploy --prebuilt`).
 *
 * WHY: the myform-api Vercel project has Root Directory = apps/api with a
 * buildCommand that esbuilds `serverless/adapter.ts` into `api/main.js`.
 * Function discovery scans the UPLOADED source tree — a bundle generated
 * DURING the build is never seen, so the deployment ships without a lambda
 * (observed: Ready deployment, zero @vercel/node builder logs, /v1/* 404).
 * Emitting the Build Output API ourselves makes the function explicit:
 *
 *   <out>/config.json                     routes (filesystem → /v1 rewrite)
 *   <out>/static/**                       apps/api/public (robots.txt)
 *   <out>/functions/api/main.func/        esbuild bundle + .vc-config.json
 *
 * Usage: node scripts/build-vercel-output.mjs <outDir>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const API_DIR = path.join(ROOT, "apps", "api");
const outDir = path.resolve(process.argv[2] ?? path.join(ROOT, ".vercel-api-output"));

// Same external set as the vercel.json buildCommand: these packages are NOT
// installed in the workspace (Nest loads them lazily via loadPackage with a
// graceful fallback), so esbuild must not try to resolve them.
const EXTERNALS = [
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module.js",
  "@nestjs/websockets",
  "@nestjs/websockets/socket-module.js",
];

const funcDir = path.join(outDir, "functions", "api", "main.func");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(funcDir, { recursive: true });

const esbuildBin = path.join(API_DIR, "node_modules", ".bin", "esbuild");
execFileSync(
  esbuildBin,
  [
    path.join("serverless", "adapter.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node20",
    `--outfile=${path.join(funcDir, "index.js")}`,
    ...EXTERNALS.map((e) => `--external:${e}`),
    "--log-limit=0",
  ],
  { cwd: API_DIR, stdio: "inherit" },
);

fs.writeFileSync(
  path.join(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.js",
      maxDuration: 60,
      memory: 1024,
    },
    null,
    2,
  ) + "\n",
);

// Static output: the public/ dir (robots.txt etc.).
const staticDir = path.join(outDir, "static");
fs.cpSync(path.join(API_DIR, "public"), staticDir, { recursive: true });

// Routes: static files first, then the ADR-0003 hop — every /v1/* request
// goes to the bundled NestJS function.
fs.writeFileSync(
  path.join(outDir, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        { src: "/v1/(.*)", dest: "/api/main" },
      ],
    },
    null,
    2,
  ) + "\n",
);

const bundleMb = (
  fs.statSync(path.join(funcDir, "index.js")).size / (1024 * 1024)
).toFixed(1);
process.stdout.write(
  `Build Output API written to ${outDir}\n` +
    `  functions/api/main.func/index.js: ${bundleMb} MB\n` +
    `  static: ${fs.readdirSync(staticDir).join(", ") || "(empty)"}\n`,
);
