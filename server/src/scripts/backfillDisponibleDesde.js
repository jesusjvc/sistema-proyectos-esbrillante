// Migración de datos (una sola vez, manual): antes de agregar disponibleDesde
// a Tarea, las tareas de cliente ya disponibles (dependencias completadas)
// no tenían ningún registro de desde cuándo. Este script las recorre y les
// asigna disponibleDesde = ahora, para que empiecen a contar plazoHoras y a
// aparecer en el badge de "atrasada" / recordatorios desde este momento en
// vez de quedar en null para siempre. Es idempotente (usa la misma función
// que corre en producción tras cada cambio de estado).
//
// Uso: cd server && node src/scripts/backfillDisponibleDesde.js
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { activarTareasClienteDisponibles } from '../lib/tareaHelpers.js'

async function main() {
  const proyectos = await prisma.proyecto.findMany({ select: { id: true, slug: true } })

  for (const p of proyectos) {
    await activarTareasClienteDisponibles(p.id)
  }

  console.log(`Proyectos revisados: ${proyectos.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
