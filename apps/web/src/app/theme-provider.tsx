import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

/**
 * Sistema de tema no padrão shadcn/ui. Três estados:
 *   - "light" / "dark": escolha explícita, gravada em localStorage
 *   - "system": segue o prefers-color-scheme do SO em tempo real
 *
 * A classe `.dark` é aplicada em <html> (document.documentElement), que é
 * onde as variáveis CSS de globals.css esperam ser sobrescritas.
 *
 * O flash inicial (FOUC) é evitado por um script inline em index.html que
 * roda antes da primeira pintura — este provider só assume o controle
 * depois que o React monta.
 */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "questum-theme";

interface ThemeContextValue {
  /** Preferência escolhida (pode ser "system"). */
  theme: Theme;
  /** Tema efetivamente aplicado agora ("light" ou "dark"), já resolvendo "system". */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function lerTemaGravado(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const valor = window.localStorage.getItem(STORAGE_KEY);
    if (valor === "light" || valor === "dark" || valor === "system") return valor;
  } catch {
    // localStorage pode lançar (modo privado, etc.) — cai no padrão.
  }
  return "system";
}

function prefereEscuro(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(lerTemaGravado);
  const [systemIsDark, setSystemIsDark] = useState(prefereEscuro);

  // Acompanha a troca de tema do SO enquanto a preferência for "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = (evento: MediaQueryListEvent) => setSystemIsDark(evento.matches);
    media.addEventListener("change", aoMudar);
    return () => media.removeEventListener("change", aoMudar);
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? (systemIsDark ? "dark" : "light") : theme;

  // Aplica a classe no <html> sempre que o tema efetivo muda.
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle("dark", resolvedTheme === "dark");
    raiz.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((novo: Theme) => {
    setThemeState(novo);
    try {
      window.localStorage.setItem(STORAGE_KEY, novo);
    } catch {
      // Sem persistência se o localStorage não estiver disponível.
    }
  }, []);

  const valor = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const contexto = useContext(ThemeContext);
  if (!contexto) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return contexto;
}
