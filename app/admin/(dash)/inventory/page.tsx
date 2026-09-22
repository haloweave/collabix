import { Suspense } from "react";
import { listInventory } from "@/lib/admin/queries";
import { InventoryRow } from "@/components/admin/inventory-row";
import { CardSkeleton, TextSkeleton } from "@/components/admin/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  // Start loading without awaiting so the heading paints first; the summary
  // count and the floor cards stream in from the shared promise.
  const inventoryPromise = listInventory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          <Suspense fallback={<TextSkeleton className="w-56" />}>
            <InventorySummary dataPromise={inventoryPromise} />
          </Suspense>
        </p>
      </div>

      <Suspense
        fallback={
          <>
            <CardSkeleton lines={4} />
            <CardSkeleton lines={4} />
          </>
        }
      >
        <InventoryFloors dataPromise={inventoryPromise} />
      </Suspense>
    </div>
  );
}

async function InventorySummary({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listInventory>;
}) {
  const floors = await dataPromise;
  const all = floors.flatMap((f) => f.zones.flatMap((z) => z.resources));
  const online = all.filter((r) => r.enabled).length;
  return (
    <>
      {online} of {all.length} seats online. Take a seat offline to remove it
      from availability without deleting it.
    </>
  );
}

async function InventoryFloors({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listInventory>;
}) {
  const floors = await dataPromise;
  const all = floors.flatMap((f) => f.zones.flatMap((z) => z.resources));

  return (
    <>
      {floors.map((floor) => (
        <div key={floor.id} className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {floor.name}
          </h2>
          {floor.zones.map((zone) => {
            const zoneOnline = zone.resources.filter((r) => r.enabled).length;
            return (
              <Card key={zone.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{zone.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {zoneOnline}/{zone.resources.length} online
                    </Badge>
                  </div>
                  <CardDescription className="capitalize">
                    {zone.kind.replace("_", " ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                  {zone.resources.map((r) => (
                    <InventoryRow key={r.id} resource={r} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {all.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No inventory found. Run the seed script to create it.
        </p>
      )}
    </>
  );
}
