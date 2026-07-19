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
          <div className="text-lg font-semibold tracking-tight text-brand">
            Alta Panel
          </div>
          <p className="mt-1 text-sm text-muted">
            Panel de operaciones de AltaHomes
          </p>
        </div>
        <LoginForm next={destino} />
      </div>
    </main>
  );
}
