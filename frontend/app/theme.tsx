// frontend/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { emit } from '@tauri-apps/api/event'

type ThemeContextType = {
  theme: string
  switchTheme: () => void
}

const defaultThemeContext: ThemeContextType = {
  theme: 'dark',
  switchTheme: () => {},
}
const ThemeContext = createContext<ThemeContextType>(defaultThemeContext)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(
    localStorage.getItem('app-theme') ??
      (window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'),
  )

  const switchTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'))
  }

  useEffect(() => {
    // This directly matches your @custom-variant selector
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('app-theme', theme)
    // Notify other windows (e.g. new-connection) of theme change
    emit('theme-changed', { theme }).catch(() => {})
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, switchTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook exported alongside ThemeProvider; moving it would split the theme module
export const useTheme = () => useContext(ThemeContext)
