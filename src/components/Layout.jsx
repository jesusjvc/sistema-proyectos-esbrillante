import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { LayoutDashboard, ListChecks, PlusCircle, LogOut, ChevronLeft, Users, Package, Sun, Moon } from 'lucide-react'
import logo from '../assets/logo-esbrillante.svg'

export default function Layout({ children, titulo, volver }) {
  const { user, logout } = useAuth()
  const { tema, toggleTema } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  async function salir() {
    await logout()
    navigate('/')
  }

  const esAdmin = user?.rol === 'admin'
  const esEquipo = user?.rol === 'equipo'

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <aside className="w-60 bg-slate-950 text-white flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <img src={logo} alt="EsBrillante" className="h-7 w-auto" />
          <div className="text-xs text-slate-400 mt-1.5">Sistema de Proyectos</div>
        </div>

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

        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-1">Sesión activa</div>
          <div className="text-sm font-medium text-white">{user?.nombre || '—'}</div>
          <div className="text-xs text-slate-500 capitalize">{user?.rol}</div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={salir}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={13} />
              Cerrar sesión
            </button>
            <button
              onClick={toggleTema}
              title={tema === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors ml-auto"
            >
              {tema === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center gap-3">
          {volver && (
            <button
              onClick={() => navigate(volver)}
              className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-sm transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{titulo}</h1>
        </header>
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
        active ? 'bg-brand-500 text-slate-900 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
