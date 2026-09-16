import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, Video, Plus } from "lucide-react";

export default function GeneratePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Generate</h1>
          <p className="text-muted-foreground mt-1">Create videos and manage the avatars that star in them.</p>
        </div>
        <Button asChild>
          <Link href="/scripts/new"><Plus className="size-4" /> New batch</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/avatars" className="group">
          <Card className="h-full transition-colors group-hover:border-orange-500/60">
            <CardHeader>
              <Users className="size-6 text-orange-500" />
              <CardTitle>Avatars</CardTitle>
              <CardDescription>Manage your avatars, their backgrounds and subtitle styles.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/scripts" className="group">
          <Card className="h-full transition-colors group-hover:border-orange-500/60">
            <CardHeader>
              <FileText className="size-6 text-orange-500" />
              <CardTitle>Scripts &amp; Batches</CardTitle>
              <CardDescription>Write or generate scripts, then queue whole batches for video.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/videos" className="group">
          <Card className="h-full transition-colors group-hover:border-orange-500/60">
            <CardHeader>
              <Video className="size-6 text-orange-500" />
              <CardTitle>Videos</CardTitle>
              <CardDescription>Watch progress live, regenerate clips, download finished reels.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How generation works</CardTitle>
          <CardDescription>
            Scripts are split into clips, rendered in parallel on Google Flow with your avatar&apos;s
            look and selected subtitle style, then stitched into a finished vertical video.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Pick an avatar with a reference photo in Avatars, choose its subtitle style, then queue a
          batch from Scripts — everything after that is automatic.
        </CardContent>
      </Card>
    </div>
  );
}
