import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import Login from './pages/Login'
import AdminDashboard from './pages/admin/Dashboard'
import NuevoProyecto from './pages/admin/NuevoProyecto'
import DetalleProyecto from './pages/admin/DetalleProyecto'
import Equipo from './pages/admin/Equipo'
import Paquetes from './pages/admin/Paquetes'
import EditarPaquete from './pages/admin/EditarPaquete'
import MisTareas from './pages/equipo/MisTareas'
import ProyectoEquipo from './pages/equipo/ProyectoEquipo'
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
      <Route path="/admin/paquetes" element={<RequireAuth rol="admin"><Paquetes /></RequireAuth>} />
      <Route path="/admin/paquetes/:id" element={<RequireAuth rol="admin"><EditarPaquete /></RequireAuth>} />

      <Route path="/equipo" element={<RequireAuth rol="equipo"><MisTareas /></RequireAuth>} />
      <Route path="/equipo/proyecto/:id" element={<RequireAuth rol="equipo"><ProyectoEquipo /></RequireAuth>} />

      <Route path="/cliente" element={<AccesoCliente />} />
      <Route path="/cliente/:id" element={<VistaCliente />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
