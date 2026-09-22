import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { listMembers } from "@/lib/admin/queries";
import { istDate } from "@/lib/admin/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberForm } from "@/components/admin/member-form";
import { TableSkeleton } from "@/components/admin/skeletons";

export const dynamic = "force-dynamic";

export default async function StaffMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const membersPromise = listMembers(q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Look someone up, add a new member, or open their profile to assign a
          membership plan.
        </p>
      </div>

      <MemberForm />

      <Card>
        <CardHeader>
          <CardTitle>Find a member</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex items-center gap-2" action="/staff/members">
            <div className="relative flex-1 max-w-sm">
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

          <Suspense fallback={<TableSkeleton rows={5} cols={4} />}>
            <StaffMembersTable dataPromise={membersPromise} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function StaffMembersTable({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listMembers>;
}) {
  const members = await dataPromise;

  return (
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
            <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
              No members found.
            </TableCell>
          </TableRow>
        )}
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell>
              <Link href={`/admin/members/${m.id}`} className="block">
                <span className="font-medium">{m.name}</span>
                <span className="block text-xs text-muted-foreground">{m.email}</span>
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={m.role === "member" ? "outline" : "default"} className="capitalize">
                {m.role}
              </Badge>
            </TableCell>
            <TableCell className="text-center text-sm">{m.bookings}</TableCell>
            <TableCell className="text-sm">{istDate(m.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
