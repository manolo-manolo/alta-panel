import { Star } from "lucide-react";

export default function Estrellas({ rating, size = 13 }: { rating: number | null; size?: number }) {
  if (rating === null) return <span className="text-xs text-faint">sin nota</span>;
  // Estrella llena desde x,75: un 4,5 son cuatro estrellas, no cinco.
  const llenas = Math.floor(rating + 0.25);
  return (
    <span
      className="inline-flex items-center gap-px"
      title={`${rating.toFixed(2).replace(".", ",")} / 5`}
      aria-label={`${rating.toFixed(1).replace(".", ",")} de 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < llenas ? "fill-warn text-warn" : "fill-line text-line"}
          aria-hidden
        />
      ))}
    </span>
  );
}
