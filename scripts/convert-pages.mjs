/**
 * Convert cleaned Claude artifact HTML pages into Next.js App Router pages.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("clean-pages");
const OUT = path.resolve("fcc-website/src");
const PAGES_OUT = path.join(OUT, "app");

const ROUTE_MAP = {
  "index.html": "/",
  "about.html": "/about",
  "committees.html": "/committees",
  "policy.html": "/policy",
  "contact.html": "/contact",
  "members.html": "/members",
  "membership-benefits.html": "/membership-benefits",
  "apply-membership.html": "/apply-membership",
  "partners.html": "/partners",
  "partnership-benefits.html": "/partnership-benefits",
  "apply-partnership.html": "/apply-partnership",
  "live-events.html": "/live-events",
  "virtual-events.html": "/virtual-events",
  "research.html": "/research",
  "annual-report.html": "/annual-report",
  "committee-credit-bureau.html": "/committees/credit-bureau",
  "committee-digital-lending.html": "/committees/digital-lending",
  "committee-insurtech.html": "/committees/insurtech",
  "committee-regtech.html": "/committees/regtech",
  "committee-wealthtech.html": "/committees/wealthtech",
};

function rewriteLinks(html) {
  let out = html;
  for (const [file, route] of Object.entries(ROUTE_MAP)) {
    const re = new RegExp(`href="${file.replace(".", "\\.")}(#[^"]*)?"`, "g");
    out = out.replace(re, (_, hash = "") => `href="${route}${hash || ""}"`);
  }
  out = out.replace(/href="([a-z0-9-]+)\.html(#[^"]*)?"/g, 'href="/$1$2"');
  return out;
}

function extractMain(html) {
  const headerEnd = html.indexOf("</header>");
  const footerStart = html.indexOf("<footer");
  if (headerEnd < 0 || footerStart < 0) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
  }
  let main = html.slice(headerEnd + "</header>".length, footerStart);
  main = main.replace(/^\s*<main>\s*/i, "").replace(/\s*<\/main>\s*$/i, "");
  // Drop any leftover scripts in main region
  main = main.replace(/<script[\s\S]*?<\/script>/gi, "");
  return main.trim();
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "FCC";
}

function extractDescription(html) {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return m ? m[1] : "Fintech Convergence Council";
}

function extractMembersData(html) {
  const m = html.match(/window\.FCC_MEMBERS\s*=\s*(\[[\s\S]*?\]);/);
  return m ? m[1] : null;
}

function pageFileFor(route) {
  if (route === "/") return path.join(PAGES_OUT, "page.tsx");
  return path.join(PAGES_OUT, route.slice(1), "page.tsx");
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error("clean-pages missing");
    process.exit(1);
  }

  let membersJson = null;
  const membersSrc = path.join(ROOT, "members.html");
  if (fs.existsSync(membersSrc)) {
    membersJson = extractMembersData(fs.readFileSync(membersSrc, "utf8"));
    if (membersJson) {
      const dataFile = path.join(OUT, "data", "members.ts");
      ensureDir(dataFile);
      fs.writeFileSync(
        dataFile,
        `export const FCC_MEMBERS: [string, string][] = ${membersJson};\n`,
        "utf8",
      );
      console.log("wrote members data");
    }
  }

  for (const [file, route] of Object.entries(ROUTE_MAP)) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) {
      console.warn("missing", file);
      continue;
    }
    const html = fs.readFileSync(src, "utf8");
    const mainHtml = extractMain(html);
    const title = extractTitle(html);
    const description = extractDescription(html);
    const outFile = pageFileFor(route);
    ensureDir(outFile);

    const safeHtml = rewriteLinks(mainHtml)
      .replace(/onsubmit="[^"]*"/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const needsMembers = route === "/members" && membersJson;

    const content = `import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteInteractions } from "@/components/SiteInteractions";
${needsMembers ? 'import { MembersBootstrap } from "@/components/MembersBootstrap";\n' : ""}
export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
};

const html = ${JSON.stringify(safeHtml)};

export default function Page() {
  return (
    <>
      <SiteHeader active=${JSON.stringify(route)} />
      <main dangerouslySetInnerHTML={{ __html: html }} />
      <SiteFooter />
      ${needsMembers ? "<MembersBootstrap />" : ""}
      <SiteInteractions />
    </>
  );
}
`;
    fs.writeFileSync(outFile, content, "utf8");
    console.log("wrote", path.relative(process.cwd(), outFile), `(${Math.round(safeHtml.length / 1024)}kb)`);
  }
}

main();
