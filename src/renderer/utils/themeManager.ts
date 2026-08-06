import { AppThemeMode } from '../../shared/settings';

export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: AppThemeMode = 'dark-glass';
  private mediaQueryListener?: (e: MediaQueryListEvent) => void;

  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  public applyTheme(theme: AppThemeMode): void {
    this.currentTheme = theme;
    let resolvedTheme = theme;

    if (theme === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = prefersDark ? 'dark-glass' : 'light-glass';

      if (!this.mediaQueryListener && window.matchMedia) {
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        this.mediaQueryListener = (e: MediaQueryListEvent) => {
          if (this.currentTheme === 'system') {
            const dynamicTheme = e.matches ? 'dark-glass' : 'light-glass';
            document.documentElement.setAttribute('data-theme', dynamicTheme);
          }
        };
        query.addEventListener('change', this.mediaQueryListener);
      }
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }

  public getCurrentTheme(): AppThemeMode {
    return this.currentTheme;
  }
}

export const themeManager = ThemeManager.getInstance();
