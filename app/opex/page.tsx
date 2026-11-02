import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui";
import OpexUpload from "@/components/OpexUpload";
import { estadoDatos, mesPorDefecto } from "@/lib/metrics";

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

  return (
    <AppShell
      titulo="Subir gastos"
      subtitulo="Actualiza el opex de la cartera con el Excel de gastos"
      estado={estado}
      mes={mes}
      ancho="estrecho"
    >
      <Card>
        <CardHeader
          titulo="Archivo de gastos"
          descripcion="CSV o texto separado por tabuladores, exportado desde el Excel"
        />
        <ul className="mb-5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            El formato se detecta solo: el Excel histórico por bloques o el formato mensual
            (Unidad, Categoría y un mes por columna).
          </li>
          <li>
            Se mapean las categorías, se excluyen comisiones de canal y capex, y se regeneran las
            estimaciones de los meses sin datos.
          </li>
          <li>Cada formato reemplaza solo su propia carga anterior.</li>
        </ul>
        <OpexUpload />
      </Card>
    </AppShell>
  );
}
