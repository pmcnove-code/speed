import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listAccessCodes } from "@/lib/access-codes";
import { providerInfos } from "@/lib/llm/provider";
import { SettingsView } from "@/components/settings/settings-view";
import { airtableConfig } from "@/lib/airtable";
import { publicConfig } from "@/lib/config";

export default async function SettingsPage() {
  const session = await getSession();
  if (session!.role !== "admin") redirect("/");

  return (
    <SettingsView
      codes={await listAccessCodes()}
      fields={await publicConfig()}
      providers={await providerInfos()}
      airtable={await airtableConfig()}
    />
  );
}
