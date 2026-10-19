import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "theme";
const Ctx = createContext<{ theme: Theme; setTheme: (t: string) => void }>({ theme: "system", setTheme: () => {} });

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Minimal light/dark/system theme: toggles the `dark` class on <html> and remembers the choice. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  const setTheme = (t: string) => {
    const next: Theme = t === "light" || t === "dark" ? t : "system";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: theme just won't persist */
    }
    setThemeState(next);
  };
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
