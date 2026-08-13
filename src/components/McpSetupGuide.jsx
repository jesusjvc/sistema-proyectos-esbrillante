import { useState } from 'react'
import { Copy, Check, Sparkles } from 'lucide-react'

const MCP_URL = 'https://api-proyectos.esbrillante.mx/mcp'

export default function McpSetupGuide() {
  const [tab, setTab] = useState('cowork')

  return (
    <div className="max-w-3xl space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800">Conectar Claude Code al Sistema de Seguimiento</h2>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          Una vez conectado, puedes pedirle a Claude que reporte avance, marque tareas como listas o consulte
          el estado de un proyecto directo desde tu sesión — sin entrar a este panel.
        </p>
      </div>

      <div className="flex border-b border-slate-200">
        {[
          ['cowork', 'Claude Cowork / claude.ai'],
          ['cli', 'Claude Code (CLI)'],
        ].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'cowork' && <TabCowork />}
      {tab === 'cli' && <TabCli />}

      <ToolsTable />
    </div>
  )
}

function TabCowork() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-brand-800 bg-brand-50 px-2.5 py-1 rounded-full w-fit">
        <Sparkles size={12} /> Recomendado para el equipo
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">
        Cada persona conecta con su propia cuenta (el mismo correo y contraseña con los que entras a este
        panel), así que tus acciones quedan registradas a tu nombre y respetan lo que tienes asignado en
        cada proyecto.
      </p>

      <ol className="space-y-3">
        <PasoItem n={1}>
          Si tu espacio de trabajo de Claude Cowork todavía no tiene el conector agregado, pide a un admin
          que lo agregue apuntando a:
          <CopyBlock value={MCP_URL} className="mt-2" />
          <p className="text-xs text-slate-400 mt-1.5">Sin API key — este flujo usa tu login, no una key compartida.</p>
        </PasoItem>
        <PasoItem n={2}>
          La primera vez que uses una herramienta de <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">esbrillante-seguimiento</code>,
          Claude te va a pedir "Conectar con el Sistema de Seguimiento" — mete ahí tu correo y contraseña.
        </PasoItem>
        <PasoItem n={3}>
          Listo. Desde ese momento tus acciones (iniciar/completar tareas, registrar avance, etc.) quedan a
          tu nombre real, y si intentas algo sobre una tarea que no te corresponde, Claude te va a explicar
          por qué en vez de ejecutarlo.
        </PasoItem>
      </ol>
    </div>
  )
}

function TabCli() {
  const [shell, setShell] = useState('bash')

  const cmdExport = shell === 'fish'
    ? 'set -x ESBRILLANTE_MCP_KEY "<pide-esta-key-a-un-admin>"'
    : 'export ESBRILLANTE_MCP_KEY="<pide-esta-key-a-un-admin>"'

  const cmdAdd = shell === 'fish'
    ? `claude mcp add --transport http esbrillante-seguimiento ${MCP_URL} \\\n  --header "Authorization: Bearer $ESBRILLANTE_MCP_KEY" \\\n  --scope user`
    : `claude mcp add --transport http esbrillante-seguimiento ${MCP_URL} \\\n  --header "Authorization: Bearer \${ESBRILLANTE_MCP_KEY}" \\\n  --scope user`

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <p className="text-sm text-slate-600 leading-relaxed">
        Conecta tu Claude Code local (en la terminal) usando una API key compartida — pídesela a un admin
        por un canal seguro, nunca la subas a un repo ni la compartas fuera del equipo.
      </p>

      <div className="flex items-center gap-1.5 text-xs">
        {['bash', 'fish'].map((s) => (
          <button
            key={s}
            onClick={() => setShell(s)}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
              shell === s ? 'bg-brand-500 text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {s === 'bash' ? 'bash / zsh' : 'fish'}
          </button>
        ))}
      </div>

      <ol className="space-y-3">
        <PasoItem n={1}>
          Exporta la key en tu shell:
          <CopyBlock value={cmdExport} className="mt-2" multiline />
        </PasoItem>
        <PasoItem n={2}>
          Agrega el MCP (queda guardado en tu <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">~/.claude.json</code>, disponible en todos tus repos):
          <CopyBlock value={cmdAdd} className="mt-2" multiline />
        </PasoItem>
        <PasoItem n={3}>
          Verifica la conexión con <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">claude mcp list</code> (fuera de una sesión) o{' '}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/mcp</code> (dentro de una sesión) — debe aparecer{' '}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">esbrillante-seguimiento</code> conectado.
        </PasoItem>
      </ol>

      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        Esta key es compartida: tus acciones vía CLI quedan a nombre de "Claude Code (MCP)", no del tuyo, y
        sin las restricciones de permisos por proyecto. Si quieres que tus acciones queden registradas a tu
        nombre y respeten lo que tienes asignado, usa mejor Claude Cowork.
      </p>
    </div>
  )
}

function PasoItem({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <div className="flex-1 text-sm text-slate-700 leading-relaxed min-w-0">{children}</div>
    </li>
  )
}

function CopyBlock({ value, className = '', multiline = false }) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    navigator.clipboard.writeText(value)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className={`relative ${className}`}>
      <pre className={`text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 pr-10 font-mono overflow-x-auto ${multiline ? 'whitespace-pre' : 'whitespace-nowrap'}`}>
        {value}
      </pre>
      <button
        onClick={copiar}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-slate-200 hover:border-brand-300 text-slate-500 hover:text-brand-700 transition-colors"
        title="Copiar"
      >
        {copiado ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      </button>
    </div>
  )
}

const TOOLS = [
  ['listar_proyectos', 'Ver todos los proyectos activos y su estado general'],
  ['ver_proyecto', 'Fase actual, % de avance, tareas pendientes propias y del cliente'],
  ['registrar_actividad', 'Reportar algo que se hizo (o se está haciendo) que no estaba en el checklist original'],
  ['solicitar_al_cliente', 'Pedirle algo al cliente — aparece de inmediato en su portal'],
  ['iniciar_actividad', 'Marcar una tarea como "en proceso" de verdad'],
  ['completar_actividad', 'Marcar como lista una tarea ya existente'],
  ['editar_actividad', 'Corregir una tarea ya creada sin cancelarla y volver a crearla'],
  ['nota_interna', 'Nota libre solo para el panel admin, nunca visible al cliente'],
]

function ToolsTable() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Qué puedes hacer una vez conectado</h3>
      </div>
      <div className="divide-y divide-slate-50">
        {TOOLS.map(([tool, desc]) => (
          <div key={tool} className="px-5 py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
            <code className="text-xs font-mono text-brand-800 bg-brand-50 px-1.5 py-0.5 rounded w-fit shrink-0">{tool}</code>
            <span className="text-sm text-slate-600">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
