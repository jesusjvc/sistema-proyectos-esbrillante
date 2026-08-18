import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import Login from './pages/Login'
import AdminDashboard from './pages/admin/Dashboard'
import NuevoProyecto from './pages/NuevoProyecto'
import DetalleProyecto from './pages/DetalleProyecto'
import Equipo from './pages/admin/Equipo'
import Prototipos from './pages/Prototipos'
import Paquetes from './pages/admin/Paquetes'
import EditarPaquete from './pages/admin/EditarPaquete'
import McpAdmin from './pages/admin/Mcp'
import Proyectos from './pages/equipo/Proyectos'
import MisTareas from './pages/equipo/MisTareas'
import McpEquipo from './pages/equipo/Mcp'
import AccesoCliente from './pages/cliente/AccesoCliente'
import VistaCliente from './pages/cliente/VistaCliente'

function RequireAuth({ rol, children }) {
  const { user } = useAuth()
  if (user === undefined) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!user || user.rol !== rol) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/admin" element={<RequireAuth rol="admin"><AdminDashboard /></RequireAuth>} />
      <Route path="/admin/proyecto/nuevo" element={<RequireAuth rol="admin"><NuevoProyecto /></RequireAuth>} />
      <Route path="/admin/proyecto/:id" element={<RequireAuth rol="admin"><DetalleProyecto /></RequireAuth>} />
      <Route path="/admin/equipo" element={<RequireAuth rol="admin"><Equipo /></RequireAuth>} />
      <Route path="/admin/prototipos" element={<RequireAuth rol="admin"><Prototipos /></RequireAuth>} />
      <Route path="/admin/paquetes" element={<RequireAuth rol="admin"><Paquetes /></RequireAuth>} />
      <Route path="/admin/paquetes/:id" element={<RequireAuth rol="admin"><EditarPaquete /></RequireAuth>} />
      <Route path="/admin/mcp" element={<RequireAuth rol="admin"><McpAdmin /></RequireAuth>} />

      <Route path="/equipo" element={<RequireAuth rol="equipo"><Proyectos /></RequireAuth>} />
      <Route path="/equipo/tareas" element={<RequireAuth rol="equipo"><MisTareas /></RequireAuth>} />
      <Route path="/equipo/proyecto/nuevo" element={<RequireAuth rol="equipo"><NuevoProyecto /></RequireAuth>} />
      <Route path="/equipo/proyecto/:id" element={<RequireAuth rol="equipo"><DetalleProyecto /></RequireAuth>} />
      <Route path="/equipo/prototipos" element={<RequireAuth rol="equipo"><Prototipos /></RequireAuth>} />
      <Route path="/equipo/mcp" element={<RequireAuth rol="equipo"><McpEquipo /></RequireAuth>} />

      <Route path="/cliente" element={<AccesoCliente />} />
      <Route path="/cliente/:id" element={<VistaCliente />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
