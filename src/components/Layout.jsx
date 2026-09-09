import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { LayoutDashboard, ListChecks, PlusCircle, LogOut, ChevronLeft, ChevronRight, Users, Package, Sun, Moon, LayoutTemplate, Terminal } from 'lucide-react'
import logo from '../assets/logo-foco-dark.svg'
import icono from '../assets/icon-foco.svg'
import AvatarUploader from './AvatarUploader'

const SIDEBAR_COLAPSADO_KEY = 'sidebarColapsado'

export default function Layout({ children, titulo, volver, badge, acciones }) {
  const { user, setUser, logout } = useAuth()
  const { tema, toggleTema } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(SIDEBAR_COLAPSADO_KEY) === '1')

  async function salir() {
    await logout()
    navigate('/')
  }

  function toggleColapsado() {
    setColapsado((v) => {
      const next = !v
      localStorage.setItem(SIDEBAR_COLAPSADO_KEY, next ? '1' : '0')
      return next
    })
  }

  const esAdmin = user?.rol === 'admin'
  const esEquipo = user?.rol === 'equipo'

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-ink-950 overflow-hidden">
      <aside className={`${colapsado ? 'w-16' : 'w-60'} bg-ink-950 text-white flex flex-col shrink-0 transition-[width] duration-150`}>
        <div className={`${colapsado ? 'px-0 py-5 flex justify-center' : 'px-5 py-5'} border-b border-ink-500 shrink-0`}>
          {colapsado ? (
            <img src={icono} alt="Foco" className="h-7 w-7" title="Foco" />
          ) : (
            <>
              <img src={logo} alt="Foco" className="h-7 w-auto" />
              <div className="text-xs text-ink-300 mt-1.5">by EsBrillante</div>
            </>
          )}
        </div>

        <nav className={`flex-1 ${colapsado ? 'px-2' : 'px-3'} py-4 space-y-1 overflow-y-auto`}>
          {esAdmin && (
            <>
              <NavLink to="/admin" icon={<LayoutDashboard size={16} />} label="Proyectos" active={location.pathname === '/admin'} colapsado={colapsado} />
              <NavLink to="/admin/proyecto/nuevo" icon={<PlusCircle size={16} />} label="Nuevo proyecto" active={location.pathname === '/admin/proyecto/nuevo'} colapsado={colapsado} />
              <NavLink to="/admin/tareas" icon={<ListChecks size={16} />} label="Mis tareas" active={location.pathname === '/admin/tareas'} colapsado={colapsado} />
              <NavLink to="/admin/paquetes" icon={<Package size={16} />} label="Paquetes" active={location.pathname.startsWith('/admin/paquetes')} colapsado={colapsado} />
              <NavLink to="/admin/equipo" icon={<Users size={16} />} label="Equipo" active={location.pathname === '/admin/equipo'} colapsado={colapsado} />
              <NavLink to="/admin/prototipos" icon={<LayoutTemplate size={16} />} label="Prototipos" active={location.pathname === '/admin/prototipos'} colapsado={colapsado} />
              <NavLink to="/admin/mcp" icon={<Terminal size={16} />} label="Conectar Claude Code" active={location.pathname === '/admin/mcp'} colapsado={colapsado} />
            </>
          )}
          {esEquipo && (
            <>
              <NavLink to="/equipo" icon={<LayoutDashboard size={16} />} label="Proyectos" active={location.pathname === '/equipo'} colapsado={colapsado} />
              <NavLink to="/equipo/proyecto/nuevo" icon={<PlusCircle size={16} />} label="Nuevo proyecto" active={location.pathname === '/equipo/proyecto/nuevo'} colapsado={colapsado} />
              <NavLink to="/equipo/tareas" icon={<ListChecks size={16} />} label="Mis tareas" active={location.pathname === '/equipo/tareas'} colapsado={colapsado} />
              <NavLink to="/equipo/prototipos" icon={<LayoutTemplate size={16} />} label="Prototipos" active={location.pathname === '/equipo/prototipos'} colapsado={colapsado} />
              <NavLink to="/equipo/mcp" icon={<Terminal size={16} />} label="Conectar Claude Code" active={location.pathname === '/equipo/mcp'} colapsado={colapsado} />
            </>
          )}
        </nav>

        <button
          onClick={toggleColapsado}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className={`flex items-center gap-1.5 text-xs text-ink-300 hover:text-white hover:bg-ink-600 transition-colors border-t border-ink-500 py-2.5 shrink-0 ${colapsado ? 'justify-center' : 'justify-end px-4'}`}
        >
          {colapsado ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /> Colapsar</>}
        </button>

        <div className={`${colapsado ? 'px-2 py-3' : 'px-4 py-4'} border-t border-ink-500 shrink-0`}>
          <div className={`flex items-center gap-3 ${colapsado ? 'justify-center' : ''}`}>
            <AvatarUploader user={user} onUpdated={(u) => setUser({ ...u, rol: u.rol.toLowerCase() })} />
            {!colapsado && (
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{user?.nombre || '—'}</div>
                <div className="text-xs text-ink-300 capitalize">{user?.rol}</div>
              </div>
            )}
          </div>
          <div className={`mt-3 flex items-center gap-3 ${colapsado ? 'flex-col' : ''}`}>
            <button
              onClick={salir}
              title="Cerrar sesión"
              className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-white transition-colors"
            >
              <LogOut size={13} />
              {!colapsado && 'Cerrar sesión'}
            </button>
            <button
              onClick={toggleTema}
              title={tema === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
              className={`flex items-center gap-1 text-xs text-ink-300 hover:text-white transition-colors ${colapsado ? '' : 'ml-auto'}`}
            >
              {tema === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="bg-white dark:bg-ink-800 border-b border-slate-200 dark:border-ink-500 px-6 py-4 flex items-center gap-3 shrink-0">
          {volver && (
            <button
              onClick={() => navigate(volver)}
              className="flex items-center gap-1 text-slate-500 dark:text-ink-300 hover:text-slate-800 dark:hover:text-white text-sm transition-colors shrink-0"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            {badge}
            <h1 className="text-lg font-semibold text-slate-800 dark:text-ink-100 truncate">{titulo}</h1>
          </div>
          {acciones && <div className="flex items-center gap-2 shrink-0 ml-auto">{acciones}</div>}
        </header>
        <main className="flex-1 p-6 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  )
}

function NavLink({ to, icon, label, active, colapsado }) {
  return (
    <Link
      to={to}
      title={colapsado ? label : undefined}
      className={`flex items-center gap-2.5 py-2 rounded-lg text-sm transition-colors ${colapsado ? 'justify-center px-2' : 'px-3'} ${
        active ? 'bg-brand-500 text-slate-900 font-medium' : 'text-ink-300 hover:bg-ink-800 hover:text-white'
      }`}
    >
      {icon}
      {!colapsado && label}
    </Link>
  )
}
