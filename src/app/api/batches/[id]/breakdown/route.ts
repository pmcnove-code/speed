import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/config";
import { breakdownScript } from "@/lib/experimental/script-breakdown";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchIdStr } = await params;
  const batchId = parseInt(batchIdStr, 10);

  try {
    const body = await request.json() as { scriptText: string };
    
    if (!body.scriptText || !body.scriptText.trim()) {
      return NextResponse.json(
        { error: "scriptText is required" },
        { status: 400 }
      );
    }

    // Get Deepseek API key (DB setting, falls back to env)
    const deepseekApiKey = await getSetting("DEEPSEEK_API_KEY");
    if (!deepseekApiKey) {
      return NextResponse.json(
        { error: "Deepseek API key not configured in settings" },
        { status: 500 }
      );
    }

    // Break down the script using Deepseek
    const result = await breakdownScript(body.scriptText, deepseekApiKey);

    return NextResponse.json({
      batchId,
      totalClips: result.totalClips,
      clips: result.clips,
      junctions: result.junctions,
      lowFillClips: result.lowFillClips,
      verbatimCheckPass: result.verbatimCheckPass,
      limitCheckPass: result.limitCheckPass,
    });
  } catch (error) {
    console.error("Script breakdown error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
