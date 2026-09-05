// Propuesta de agrupación de clientes (solo lectura — no escribe nada en la
// base de datos). Paso previo al modelo `Cliente` (plan-foco.md, 4.1):
// Proyecto.cliente es un Json libre sin llave que una variantes del mismo
// cliente escritas distinto ("Panadería López", "Panaderia Lopez S.A. de
// C.V."). Agrupa por coincidencia normalizada de nombre, correo o whatsapp
// (alta confianza) y por cercanía de texto entre lo que no coincidió
// (revisar a mano — puede ser el mismo cliente con un typo, o dos clientes
// distintos con nombre parecido).
//
// A propósito NO crea Cliente ni toca clienteId. Una vez revisado, corre
// aplicarAgrupacionClientes.js (mismo criterio de agrupación) para escribir.
//
// Uso: cd server && node src/scripts/proponerAgrupacionClientes.js
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { agruparProyectosPorCliente, distancia } from '../lib/clienteMatching.js'

async function main() {
  const proyectos = await prisma.proyecto.findMany({
    select: { id: true, slug: true, cliente: true, clienteId: true, creadoEn: true },
    orderBy: { creadoEn: 'asc' },
  })

  const grupos = agruparProyectosPorCliente(proyectos)
  const gruposSeguros = grupos.filter((g) => g.length > 1)
  const sinGrupo = grupos.filter((g) => g.length === 1).map((g) => g[0])

  console.log(`\n${proyectos.length} proyectos, ${gruposSeguros.length} grupo(s) de alta confianza (nombre/correo/whatsapp coinciden exacto tras normalizar):\n`)
  gruposSeguros.forEach((g, idx) => {
    console.log(`  Grupo ${idx + 1}:`)
    g.forEach((it) => console.log(`    - ${it.proyecto.slug} — "${it.nombreOriginal}"${it.correo ? ` — ${it.correo}` : ''}${it.telefono ? ` — ${it.telefono}` : ''}`))
  })

  console.log(`\n${sinGrupo.length} proyectos sin coincidencia exacta. Posibles duplicados por nombre parecido (revisar con cuidado — puede ser un typo del MISMO cliente, o dos clientes distintos):\n`)
  let huboSugerenciasDudosas = false
  for (let i = 0; i < sinGrupo.length; i++) {
    for (let j = i + 1; j < sinGrupo.length; j++) {
      const a = sinGrupo[i], b = sinGrupo[j]
      if (!a.nombreNorm || !b.nombreNorm) continue
      const d = distancia(a.nombreNorm, b.nombreNorm)
      const umbral = Math.max(2, Math.floor(Math.min(a.nombreNorm.length, b.nombreNorm.length) * 0.25))
      if (d > 0 && d <= umbral) {
        huboSugerenciasDudosas = true
        console.log(`  ? "${a.nombreOriginal}" (${a.proyecto.slug})  <->  "${b.nombreOriginal}" (${b.proyecto.slug})  — distancia ${d}`)
      }
    }
  }
  if (!huboSugerenciasDudosas) console.log('  (ninguna)')

  const yaVinculados = proyectos.filter((p) => p.clienteId).length
  console.log(`\n${yaVinculados} proyecto(s) ya tienen clienteId asignado.`)
  console.log('\nEste script no escribió nada. Revisa los grupos de arriba antes de correr aplicarAgrupacionClientes.js.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
