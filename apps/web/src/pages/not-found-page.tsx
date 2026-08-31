import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Compass className="h-8 w-8 text-muted-foreground" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Não existe nada em <code className="rounded bg-muted px-1">{pathname}</code>. Talvez o
          endereço tenha mudado.
        </p>
      </div>
      <Button asChild>
        <Link to="/extraction">Voltar ao início</Link>
      </Button>
    </div>
  );
}
