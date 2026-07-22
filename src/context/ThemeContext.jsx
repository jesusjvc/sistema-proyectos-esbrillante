import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)
const KEY = 'esbrillante_theme'

function preferenciaGuardada() {
  const guardada = localStorage.getItem(KEY)
  if (guardada === 'light' || guardada === 'dark') return guardada
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(preferenciaGuardada)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
    localStorage.setItem(KEY, tema)
  }, [tema])

  function toggleTema() {
    setTema((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ tema, toggleTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
