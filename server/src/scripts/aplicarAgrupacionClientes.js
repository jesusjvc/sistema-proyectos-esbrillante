// Crea los registros Cliente propuestos por proponerAgrupacionClientes.js y
// llena Proyecto.clienteId — correrlo DESPUÉS de revisar esa salida, nunca
// antes (plan-foco.md, 4.1). Idempotente: salta cualquier proyecto que ya
// tenga clienteId, así que se puede volver a correr sin duplicar nada.
//
// Cada grupo (proyectos que comparten nombre/correo/whatsapp normalizado)
// se colapsa en UN Cliente, usando los datos del proyecto más antiguo del
// grupo como canónicos. No toca `Proyecto.cliente` (el Json original queda
// intacto) ni el portal del cliente — solo agrega la relación.
//
// Uso: cd server && node src/scripts/aplicarAgrupacionClientes.js
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { agruparProyectosPorCliente } from '../lib/clienteMatching.js'

async function main() {
  const proyectos = await prisma.proyecto.findMany({
    select: { id: true, slug: true, cliente: true, clienteId: true, creadoEn: true },
    orderBy: { creadoEn: 'asc' },
  })

  const pendientes = proyectos.filter((p) => !p.clienteId)
  if (!pendientes.length) {
    console.log('Todos los proyectos ya tienen clienteId. Nada que hacer.')
    return
  }

  const grupos = agruparProyectosPorCliente(pendientes)
  let clientesCreados = 0
  let proyectosVinculados = 0

  for (const grupo of grupos) {
    const canonico = grupo[0].proyecto.cliente || {}
    const cliente = await prisma.cliente.create({
      data: {
        nombreComercial: canonico.nombreComercial || '(sin nombre)',
        contactoNombre: canonico.contactoNombre || null,
        correo: canonico.correo || null,
        whatsapp: canonico.whatsapp || null,
        participantes: canonico.participantes || [],
      },
    })
    clientesCreados++

    for (const item of grupo) {
      await prisma.proyecto.update({ where: { id: item.proyecto.id }, data: { clienteId: cliente.id } })
      proyectosVinculados++
    }

    const slugs = grupo.map((it) => it.proyecto.slug).join(', ')
    console.log(`Cliente "${cliente.nombreComercial}" (${cliente.id}) <- ${slugs}`)
  }

  console.log(`\n${clientesCreados} Cliente(s) creado(s), ${proyectosVinculados} proyecto(s) vinculado(s).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
