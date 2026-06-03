import fs from "node:fs";
import path from "node:path";
import Dashboard, { EvidenceData } from "./components/Dashboard";

export const dynamic = "force-static";

function getEvidence(): EvidenceData {
  const file = path.join(process.cwd(), "public", "data", "evidence.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as EvidenceData;
}

export default function Page() {
  const data = getEvidence();
  return <Dashboard data={data} />;
}
