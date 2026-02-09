import * as fs from "fs";
import * as path from "path";

export interface RouteInfo {
  method: string;
  path: string;
  file: string;
  domain: string;
  line: number;
}

export interface DomainRoutes {
  domain: string;
  displayName: string;
  files: string[];
  routes: RouteInfo[];
}

const DOMAIN_MAP: Record<string, { domain: string; displayName: string }> = {
  "routes.ts": { domain: "core", displayName: "Core API" },
  "admin-routes.ts": { domain: "admin", displayName: "Admin API" },
  "auth.routes.ts": { domain: "auth", displayName: "Auth API" },
  "solos.routes.ts": { domain: "solos", displayName: "Solos API" },
  "vibes.routes.ts": { domain: "vibes", displayName: "Vibes API" },
  "admin.routes.ts": { domain: "admin", displayName: "Admin API" },
};

const BASE_PATH_MAP: Record<string, string> = {
  "routes.ts": "/api",
  "admin-routes.ts": "/api/admin",
  "auth.routes.ts": "/api/auth",
  "solos.routes.ts": "/api/solos",
  "vibes.routes.ts": "/api/vibes",
  "admin.routes.ts": "/api/admin",
};

const ROUTE_PATTERN = /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`](\/[^"'`]*)["'`]/gi;
const ROUTE_CHAIN_PATTERN = /\b(?:app|router)\.route\s*\(\s*["'`](\/[^"'`]*)["'`]\s*\)[^)]*?\.(get|post|put|patch|delete)\s*\(/gi;

export function scanRouteFile(filePath: string, fileName: string): RouteInfo[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const routes: RouteInfo[] = [];
  const domainInfo = DOMAIN_MAP[fileName] || { domain: fileName.replace(/\.ts$/, ""), displayName: fileName.replace(/\.ts$/, "") };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    const stdPattern = new RegExp(ROUTE_PATTERN.source, "gi");
    while ((match = stdPattern.exec(line)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: fileName,
        domain: domainInfo.domain,
        line: i + 1,
      });
    }

    const chainPattern = new RegExp(ROUTE_CHAIN_PATTERN.source, "gi");
    while ((match = chainPattern.exec(line)) !== null) {
      routes.push({
        method: match[2].toUpperCase(),
        path: match[1],
        file: fileName,
        domain: domainInfo.domain,
        line: i + 1,
      });
    }
  }

  return routes;
}

export function scanAllRoutes(): Map<string, DomainRoutes> {
  const serverDir = path.resolve(process.cwd(), "server");
  const results = new Map<string, DomainRoutes>();

  const routeFiles = ["routes.ts", "admin-routes.ts"];

  const featuresDir = path.join(serverDir, "features");
  if (fs.existsSync(featuresDir)) {
    const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true });
    for (const dir of featureDirs) {
      if (dir.isDirectory()) {
        const featureFiles = fs.readdirSync(path.join(featuresDir, dir.name));
        for (const f of featureFiles) {
          if (f.endsWith(".routes.ts")) {
            routeFiles.push(path.join("features", dir.name, f));
          }
        }
      }
    }
  }

  for (const fileName of routeFiles) {
    const filePath = path.join(serverDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    const baseName = path.basename(fileName);
    const domainInfo = DOMAIN_MAP[baseName] || DOMAIN_MAP[fileName] || {
      domain: baseName.replace(/\.routes\.ts$/, "").replace(/\.ts$/, ""),
      displayName: baseName.replace(/\.routes\.ts$/, "").replace(/\.ts$/, ""),
    };

    const routes = scanRouteFile(filePath, fileName);
    const domain = domainInfo.domain;

    if (results.has(domain)) {
      const existing = results.get(domain)!;
      existing.files.push(fileName);
      existing.routes.push(...routes);
    } else {
      results.set(domain, {
        domain,
        displayName: domainInfo.displayName,
        files: [fileName],
        routes,
      });
    }
  }

  return results;
}

export function generateAutoSection(domainRoutes: DomainRoutes): string {
  const lines: string[] = [];
  lines.push("## Endpoints");
  lines.push("");
  lines.push("| Method | Path | Source |");
  lines.push("|--------|------|--------|");

  for (const route of domainRoutes.routes) {
    lines.push(`| \`${route.method}\` | \`${route.path}\` | ${route.file}:${route.line} |`);
  }

  lines.push("");
  lines.push(`*${domainRoutes.routes.length} endpoints total. Auto-generated on ${new Date().toISOString().split("T")[0]}.*`);

  return lines.join("\n");
}

const AUTO_START = "<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->";
const AUTO_END = "<!-- === END AUTO-GENERATED SECTION === -->";

export function mergeContent(existingContent: string, autoSection: string): string {
  const startIdx = existingContent.indexOf(AUTO_START);
  const endIdx = existingContent.indexOf(AUTO_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + AUTO_END.length);
    return `${before}${AUTO_START}\n\n${autoSection}\n\n${AUTO_END}${after}`;
  }

  return `${existingContent}\n\n${AUTO_START}\n\n${autoSection}\n\n${AUTO_END}\n`;
}

export function createStubDocument(domainRoutes: DomainRoutes): string {
  const autoSection = generateAutoSection(domainRoutes);

  return `# ${domainRoutes.displayName}

## Module Info

| Property | Value |
|----------|-------|
| Domain | ${domainRoutes.domain} |
| Source Files | ${domainRoutes.files.join(", ")} |
| Endpoint Count | ${domainRoutes.routes.length} |

## Authentication & Authorization

| Aspect | Details |
|--------|---------|
| Auth Required | TBD |
| Admin Only | TBD |
| Rate Limited | TBD |

## Notes

*Add manual documentation notes here. This section is preserved during API sync.*

${AUTO_START}

${autoSection}

${AUTO_END}
`;
}
