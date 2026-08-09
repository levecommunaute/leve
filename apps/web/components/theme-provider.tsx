"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();

  useEffect(() => {
    async function applyTheme() {
      if (pathname?.startsWith("/admin")) {
        document.documentElement.setAttribute("data-theme", "A");
        return;
      }

      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          document.documentElement.setAttribute("data-theme", "A");
          return;
        }
        
        const { data } = await supabase
          .from("profiles")
          .select("theme")
          .eq("id", session.user.id)
          .maybeSingle();
        
        const theme = data?.theme ?? "A";
        document.documentElement.setAttribute("data-theme", theme);
      } catch {
        document.documentElement.setAttribute("data-theme", "A");
      }
    }
    
    void applyTheme();
  }, [pathname]);
  
  return <>{children}</>;
}
