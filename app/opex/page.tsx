import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import { Card, SectionTitle } from "@/components/ui";
import OpexUpload from "@/components/OpexUpload";
import { getUnidades, estadoDatos, mesPorDefecto } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function OpexPage() {
  await requireSesion();
  const mes = mesPorDefecto();
  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }
  let unidades: Awaited<ReturnType<typeof getUnidades>> = [];
  try {
    unidades = await getUnidades();
  } catch {
    unidades = [];
  }

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        <Card>
          <SectionTitle>Subir Opex actualizado</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Sube el CSV con la tabla de gastos (el mismo formato de siempre:
            unidades por bloques, categorias en filas y un mes por columna).
            El panel detecta los meses automaticamente, mapea las categorias,
            excluye comisiones de canal y capex, reparte General por coste y
            regenera las estimaciones de los meses sin datos. Reemplaza la carga
            anterior por completo.
          </p>
          <OpexUpload />
        </Card>
      </main>
    </div>
  );
}
