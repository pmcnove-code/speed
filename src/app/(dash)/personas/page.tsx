import { asc } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { PersonaManager } from "@/components/personas/persona-manager";
import { personaPublicColumns } from "@/db/schema";

export default async function PersonasPage() {
  const session = await getSession();
  const personas = await db.select(personaPublicColumns()).from(t.personas).orderBy(asc(t.personas.id));
  return <PersonaManager personas={personas} isAdmin={session!.role === "admin"} />;
}
