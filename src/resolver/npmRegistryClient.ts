import { request } from "undici";
import type { PackageRef, ResolvedPackage, Maintainer } from "./types";

const REGISTRY_BASE = "https://registry.npmjs.org";

const manifestCache = new Map<string, PackageManifest>();

async function fetchPackageManifest(
  packageName: string
): Promise<PackageManifest | undefined> {
  const cached = manifestCache.get(packageName);
  if (cached) return cached;

  const url = `${REGISTRY_BASE}/${encodeURIComponent(packageName).replace("%40", "@")}`;
  const res = await request(url, { method: "GET" });
  if (res.statusCode === 404) {
    return undefined;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return undefined;
  }
  try {
    const body = (await res.body.json()) as PackageManifest;
    manifestCache.set(packageName, body);
    return body;
  } catch {
    return undefined;
  }
}

function publishTimeForVersion(
  manifest: PackageManifest | undefined,
  version: string
): string | undefined {
  if (!manifest?.time) return undefined;
  const raw = manifest.time[version];
  return typeof raw === "string" ? raw : undefined;
}

export async function resolvePackage(pkg: PackageRef): Promise<ResolvedPackage> {
  const url = `${REGISTRY_BASE}/${encodeURIComponent(pkg.name).replace("%40", "@")}/${encodeURIComponent(pkg.version)}`;

  const res = await request(url, { method: "GET" });

  if (res.statusCode === 404) {
    throw new Error(`Package not found on npm: ${pkg.name}@${pkg.version}`);
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(
      `Registry error (${res.statusCode}) for ${pkg.name}@${pkg.version}`
    );
  }

  const body = (await res.body.json()) as RegistryVersionPayload;

  if (!body?.dist?.tarball) {
    throw new Error(`Missing tarball URL for ${pkg.name}@${pkg.version}`);
  }

  const manifest = await fetchPackageManifest(pkg.name);
  const publishTime = publishTimeForVersion(manifest, pkg.version);

  return {
    name: pkg.name,
    version: pkg.version,
    tarballUrl: body.dist.tarball,
    publishTime,
    maintainers: normalizeMaintainers(body.maintainers),
  };
}

function normalizeMaintainers(input: unknown): Maintainer[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((m) => (typeof m === "object" && m ? (m as Maintainer) : null))
    .filter((m): m is Maintainer => !!m);
}

type RegistryVersionPayload = {
  dist?: { tarball?: string };
  maintainers?: unknown;
};

type PackageManifest = {
  time?: Record<string, string>;
};
