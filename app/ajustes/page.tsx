import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui";
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
    <AppShell
      titulo="Ajustes"
      subtitulo="Datos de cada unidad que el panel usa para yield, caja y ocupación"
      estado={estado}
      mes={mes}
    >
      <Card>
        <CardHeader
          titulo="Unidades"
          descripcion="El coste de adquisición se usa para el NOI yield y la fecha de inicio para la ocupación real. Estos valores tienen prioridad sobre la hoja de costes."
        />
        <UnitSettingsEditor filas={filas} />
      </Card>
    </AppShell>
  );
}
