import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Acceso" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destino = next && next.startsWith("/") ? next : "/";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(13_124_116_/_0.10),transparent_70%)]"
      />
      <div className="relative w-full max-w-[380px]">
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-pop sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="AltaHomes" className="h-6 w-auto" />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">Panel de operaciones</h1>
          <p className="mt-1 text-sm text-muted">Revenue, costes y caja de toda la cartera.</p>
          <div className="mt-6">
            <LoginForm next={destino} />
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-faint">Acceso privado del equipo de AltaHomes</p>
      </div>
    </main>
  );
}
