// Local component measurement, not a Vercel billing/whole-request benchmark.
import { createNativeFile, validateNativeFile } from "../lib/office-native.ts";
import { inspectNativeFile } from "../lib/office-security.ts";
const bytes = await createNativeFile("sheet", "CPU fixture", {
  cells: Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => ["A" + (i + 1), String(i)]),
  ),
});
async function measure(count, fn) {
  const start = process.cpuUsage();
  for (let i = 0; i < count; i++) await fn();
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000 / count;
}
console.log(
  JSON.stringify(
    {
      bytes: bytes.length,
      serverInspectionCpuMsPerFile: await measure(100, () =>
        inspectNativeFile(bytes, "xlsx"),
      ),
      fullValidationCpuMsPerFile: await measure(5, () =>
        validateNativeFile(bytes, "xlsx"),
      ),
      note: "Excludes auth, database, provider calls and cold start. Full validation runs in the browser in production.",
    },
    null,
    2,
  ),
);
