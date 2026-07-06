import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => Promise<void>;
  ThemeIcon: typeof Sun | typeof Moon;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
      return 'dark'; // Default theme
    }
    return 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(async () => {
    const isDark = theme === 'dark';
    const goingDark = !isDark;
    const newTheme: Theme = goingDark ? 'dark' : 'light';

    // Fallback if browser doesn't support View Transitions
    // @ts-ignore - document.startViewTransition is not standard in some TS configs
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    // Start transition
    // @ts-ignore
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTheme(newTheme);
      });
    });

    // Wait until transition is ready
    await transition.ready;

    // Calculate dynamic sweep direction based on target theme
    const x = goingDark ? 0 : window.innerWidth;
    const y = goingDark ? window.innerHeight : 0;
    const endRadius = Math.hypot(window.innerWidth, window.innerHeight);

    // Animate the clip-path
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 700,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  }, [theme]);

  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  const value = {
    theme,
    toggleTheme,
    ThemeIcon,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
