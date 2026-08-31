import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

/**
 * Captura erros de render em qualquer lugar da árvore abaixo dela e mostra
 * uma tela de recuperação em vez da tela branca. Não pega erros em
 * handlers assíncronos (esses continuam indo pros toasts das mutations).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Ponto central pra plugar Sentry/telemetria no futuro.
    console.error("ErrorBoundary capturou:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div>
          <h1 className="text-lg font-semibold">Algo deu errado</h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A tela encontrou um erro inesperado. Recarregar costuma resolver; se persistir, avise o
            time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          <Button variant="secondary" onClick={() => this.setState({ erro: null })}>
            Tentar continuar
          </Button>
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-2 max-w-full overflow-auto rounded-md border border-border bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            {this.state.erro.message}
          </pre>
        )}
      </div>
    );
  }
}
