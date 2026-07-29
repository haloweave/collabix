import Image from "next/image";

export default function Home() {
  return (
    <main className="hero-glow grid-texture relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      {/* Logo */}
      <Image
        src="/logo-white.png"
        alt="Collabix — Work Lounge"
        width={200}
        height={64}
        priority
        className="reveal relative z-10 mb-12 h-auto w-[168px] sm:w-[200px]"
      />

      {/* Eyebrow */}
      <p className="reveal d1 relative z-10 mb-7 max-w-[20rem] px-2 text-center font-mono text-[0.66rem] font-medium uppercase leading-relaxed tracking-[0.22em] text-gold sm:max-w-none sm:text-[0.7rem] sm:tracking-[0.34em]">
        <span className="mr-2 align-middle text-[0.62em]">▲</span>
        Work Lounge · Banaswadi, Bengaluru
      </p>

      {/* Headline */}
      <h1 className="reveal d2 relative z-10 max-w-[16ch] text-balance text-4xl font-bold leading-[1.03] tracking-[-0.03em] text-white sm:text-6xl">
        Something serious is <em className="not-italic text-gold">coming.</em>
      </h1>

      {/* Tagline */}
      <p className="reveal d3 relative z-10 mt-6 max-w-[46ch] text-base leading-relaxed text-concrete sm:text-lg">
        A premium managed work lounge for founders, enterprise teams and senior
        professionals. Restrained. Purposeful. Where serious work happens.
      </p>

      {/* Status + footer.
          Email contact is intentionally hidden for now — re-enable later. */}
      <div className="reveal d4 relative z-10 mt-12 flex flex-col items-center gap-5">
        <span className="inline-flex items-center gap-2.5 rounded-sm border border-gold/40 px-5 py-3 font-mono text-xs uppercase tracking-[0.24em] text-gold-light">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          Under construction · Coming soon
        </span>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-concrete/45">
          Collabix © 2026 · Banaswadi, Bengaluru
        </p>
      </div>
    </main>
  );
}
