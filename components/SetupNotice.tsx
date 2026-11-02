import { Database } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";

export default function SetupNotice({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle?: string;
}) {
  return (
    <Card className="mx-auto w-full max-w-lg">
      <EmptyState icono={<Database size={18} aria-hidden />} titulo={titulo}>
        {detalle && <p className="mb-2 break-words">{detalle}</p>}
        <p>
          Pulsa <span className="font-medium text-brand">Actualizar datos</span> para lanzar una
          sincronización con Guesty y la hoja de costes.
        </p>
      </EmptyState>
    </Card>
  );
}
