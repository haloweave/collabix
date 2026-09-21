import Link from "next/link";
import { Search } from "lucide-react";
import { listMembers } from "@/lib/admin/queries";
import { istDate } from "@/lib/admin/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const members = await listMembers(q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} account{members.length === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}.
        </p>
      </div>

      <form className="flex items-center gap-2" action="/admin/members">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            className="pl-8"
            placeholder="Search name or email…"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Bookings</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No members found.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/admin/members/${m.id}`} className="block">
                    <span className="font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.email}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/members/${m.id}`} className="block">
                    <Badge
                      variant={m.role === "member" ? "outline" : "default"}
                      className="capitalize"
                    >
                      {m.role}
                    </Badge>
                  </Link>
                </TableCell>
                <TableCell className="text-center text-sm">
                  <Link href={`/admin/members/${m.id}`} className="block">
                    {m.bookings}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  <Link href={`/admin/members/${m.id}`} className="block">
                    {istDate(m.createdAt)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
