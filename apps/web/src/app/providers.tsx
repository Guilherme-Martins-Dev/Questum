import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState, type PropsWithChildren } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "./theme-provider";

/** Toaster do sonner seguindo o tema atual da aplicação. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors position="top-right" theme={resolvedTheme} />;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Evita refetch agressivo enquanto o revisor navega entre telas.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
