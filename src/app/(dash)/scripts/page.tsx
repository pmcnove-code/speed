"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
interface Batch {
  id: number;
  countRequested: number;
  status: string;
  createdAt: string;
  createdBy: string;
  personaIds: number[];
}

export default function ScriptsPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await fetch("/api/batches");
      if (!res.ok) throw new Error("Failed to fetch batches");
      const data = await res.json();
      setBatches(data);
    } catch (error) {
      console.error("Error fetching batches:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBatches = batches.filter((batch) =>
    batch.id.toString().includes(search) || batch.createdBy.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "bg-yellow-500/20 text-yellow-700";
      case "ready":
        return "bg-sky-500/20 text-sky-700";
      case "running":
        return "bg-blue-500/20 text-blue-700";
      case "done":
        return "bg-green-500/20 text-green-700";
      case "error":
        return "bg-red-500/20 text-red-700";
      default:
        return "bg-gray-500/20 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scripts & Batches</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your script generation batches</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/avatars">
              <Users className="mr-2 h-4 w-4" />
              Avatars
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/scripts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Batch
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by batch ID or creator..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading batches...</div>
        </div>
      ) : filteredBatches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-muted-foreground">
              {search ? "No batches match your search" : "No batches yet. Create one to get started."}
            </p>
            {!search && (
              <Button asChild variant="outline" size="sm">
                <Link href="/scripts/new">Create First Batch</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredBatches.map((batch) => (
            <Link
              key={batch.id}
              href={`/scripts/${batch.id}`}
              className="block"
            >
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">Batch #{batch.id}</CardTitle>
                      <CardDescription>
                        {batch.countRequested} scripts • Created by {batch.createdBy}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(batch.status)}>
                      {batch.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {new Date(batch.createdAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
