/** Navy, gold-lit header band that opens the admin and staff dashboards —
 *  the same treatment as the marketing site's page heroes. */
export function WelcomeBand({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-navy px-5 py-6 text-ivory shadow-lg sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_95%_-10%,rgba(200,155,83,0.22),transparent_60%)]"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-gold">
            ▲ {eyebrow}
          </span>
          <h1 className="mt-2 text-[1.6rem] font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-xl text-sm text-ivory/70">{subtitle}</p>
          )}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}
