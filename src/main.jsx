import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'
import App from './App.jsx'

// La app se renombró a Foco y se mudó a foco.esbrillante.mx — quien entre
// por el dominio anterior se manda directo al nuevo antes de montar nada,
// para no disparar llamadas a la API desde el dominio viejo.
if (window.location.hostname === 'proyectosweb.esbrillante.mx') {
  window.location.replace(window.location.href.replace('proyectosweb.esbrillante.mx', 'foco.esbrillante.mx'))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
