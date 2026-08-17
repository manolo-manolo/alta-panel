import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Acceso | Alta Panel" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destino = next && next.startsWith("/") ? next : "/";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="AltaHomes" className="h-6 w-auto" />
          <p className="mt-2 text-sm text-muted">Panel de operaciones</p>
        </div>
        <LoginForm next={destino} />
      </div>
    </main>
  );
}
