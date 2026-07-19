import { Card } from "@/components/ui";

export default function SetupNotice({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h2 className="text-base font-semibold text-ink">{titulo}</h2>
      {detalle && <p className="mt-2 text-sm text-muted">{detalle}</p>}
      <p className="mt-3 text-sm text-muted">
        Pulsa <span className="font-medium text-brand">Actualizar datos</span>{" "}
        para lanzar una sincronizacion con Guesty y la hoja de costes.
      </p>
    </Card>
  );
}
