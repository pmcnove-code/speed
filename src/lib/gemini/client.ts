import { getSetting } from "@/lib/config";

export async function geminiKey(): Promise<string> {
  return (await getSetting("GEMINI_API_KEY")).trim();
}
