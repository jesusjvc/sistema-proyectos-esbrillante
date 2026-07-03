import { Link, useNavigate, useLocation } from 'react-router-dom'
import { getSession, clearSession } from '../data/storage'
import {
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  LogOut,
  ChevronLeft,
  Users,
  Package,
} from 'lucide-react'

export default function Layout({ children, titulo, volver }) {
  const session = getSession()
  const navigate = useNavigate()
  const location = useLocation()

  function salir() {
    clearSession()
    navigate('/')
  }

  const esAdmin = session?.rol === 'admin'
  const esEquipo = session?.rol === 'equipo'

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700">
          <div className="text-sm font-semibold text-violet-400 uppercase tracking-wider">EsBrillante</div>
          <div className="text-xs text-slate-400 mt-0.5">Sistema de Proyectos</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {esAdmin && (
            <>
              <NavLink to="/admin" icon={<LayoutDashboard size={16} />} label="Proyectos" active={location.pathname === '/admin'} />
              <NavLink to="/admin/proyecto/nuevo" icon={<PlusCircle size={16} />} label="Nuevo proyecto" active={location.pathname === '/admin/proyecto/nuevo'} />
              <NavLink to="/admin/paquetes" icon={<Package size={16} />} label="Paquetes" active={location.pathname.startsWith('/admin/paquetes')} />
              <NavLink to="/admin/equipo" icon={<Users size={16} />} label="Equipo" active={location.pathname === '/admin/equipo'} />
            </>
          )}
          {esEquipo && (
            <NavLink to="/equipo" icon={<ListChecks size={16} />} label="Mis tareas" active={location.pathname === '/equipo'} />
          )}
        </nav>

        {/* Usuario */}
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Sesión activa</div>
          <div className="text-sm font-medium text-white">{session?.nombre || '—'}</div>
          <div className="text-xs text-slate-500 capitalize">{session?.rol}</div>
          <button
            onClick={salir}
            className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
          {volver && (
            <button
              onClick={() => navigate(volver)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <h1 className="text-lg font-semibold text-slate-800">{titulo}</h1>
        </header>

        {/* Main */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function NavLink({ to, icon, label, active }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
