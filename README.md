# Collabix — Work Lounge

Coming-soon site for **Collabix Work Lounge**, a premium managed office and
coworking space in Banaswadi, Bengaluru. _Where serious work happens._

Built with Next.js (App Router), TypeScript and Tailwind CSS. The current build
is a single static "under construction / coming soon" landing screen; the email
capture and full marketing site will be enabled later.

## Brand

Palette and type follow the Haloweave identity spec (v1.0):

| Token        | Hex       | Role                       |
| ------------ | --------- | -------------------------- |
| Midnight Navy| `#0B1F3A` | Primary anchor / backdrop  |
| Navy Mid     | `#162942` | Secondary dark             |
| Gold         | `#C89B53` | Prestige accent            |
| Gold Light   | `#D9B97A` | Highlight                  |
| Warm Ivory   | `#F7F5F2` | Light text / base surface  |
| Graphite     | `#4A4F58` | Structure / muted text     |

Type: **Inter** (sans) + **JetBrains Mono** (mono), loaded via `next/font`.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build    # static export-ready production build
npm start        # serve the production build
```

## Structure

```
app/
  layout.tsx     # fonts, metadata, <html> shell
  page.tsx       # the coming-soon hero
  globals.css    # brand tokens, grid-texture motif, reveal animation
public/          # logos + brand marks
```

## Demo-based website

The coming-soon page remains at `/`. The new experience is at `/home`, with
`/home/amenities`, `/home/pricing`, and `/home/booking`. The development proposal is
available directly at `/home/proposal`. These routes are previews and are marked
`noindex`; booking does not persist data, collect payment, or send notifications.

See [the feature audit and architecture plan](docs/coworking-architecture.md) for
all proposed platform capabilities, open-source comparisons, data model and rollout.
Run `npm run dev` and open `http://localhost:3000/home`.
