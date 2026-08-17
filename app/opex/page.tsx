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
            Sube el archivo de gastos (CSV o texto separado por tabuladores).
            El panel detecta el formato automaticamente: el Excel historico por
            bloques o el formato mensual (Unidad, Categoria y un mes por
            columna). Mapea las categorias, excluye comisiones de canal y capex,
            y regenera las estimaciones de los meses sin datos. Cada formato
            reemplaza solo su propia carga anterior.
          </p>
          <OpexUpload />
        </Card>
      </main>
    </div>
  );
}
