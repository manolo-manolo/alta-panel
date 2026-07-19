import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import { Card, SectionTitle } from "@/components/ui";
import UnitSettingsEditor, { type FilaAjuste } from "@/components/UnitSettingsEditor";
import { getUnidades, estadoDatos, mesPorDefecto } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  await requireSesion();
  const mes = mesPorDefecto();
  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }
  const unidades = await getUnidades();

  const filas: FilaAjuste[] = unidades.map((u) => ({
    listingId: u.listingId,
    nickname: u.nickname,
    displayName: u.displayName === u.nickname ? "" : u.displayName,
    tipo: u.tipo,
    costeAdquisicion: u.costeAdquisicion,
    rentaMensual: u.rentaMensual,
    fechaInicio: u.fechaInicio,
  }));

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Card>
          <SectionTitle>Ajustes de unidades</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Personaliza el nombre visible y los datos de cada unidad. El coste de
            adquisicion se usa para el NOI yield. Estos valores tienen prioridad
            sobre la hoja de costes.
          </p>
          <UnitSettingsEditor filas={filas} />
        </Card>
      </main>
    </div>
  );
}
