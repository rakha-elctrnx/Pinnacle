// frontend/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { emit } from '@tauri-apps/api/event'

type ThemeContextType = {
  theme: string
  switchTheme: () => void
}

const defaultThemeContext: ThemeContextType = {
  theme: 'light',
  switchTheme: () => {},
}
const ThemeContext = createContext<ThemeContextType>(defaultThemeContext)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(
    localStorage.getItem('app-theme') || 'light',
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

export const useTheme = () => useContext(ThemeContext)
