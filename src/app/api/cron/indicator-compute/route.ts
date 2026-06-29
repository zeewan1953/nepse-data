import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "compute_indicators.py");

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn("python", [scriptPath], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Exit code ${code}\n${stderr}\n${stdout}`));
      });
      proc.on("error", reject);
    });

    return NextResponse.json({
      success: true,
      output: result,
      duration: Date.now() - start,
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
      duration: Date.now() - start,
      ts: Date.now(),
    }, { status: 500 });
  }
}
