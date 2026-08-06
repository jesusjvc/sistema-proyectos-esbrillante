// Migración de datos (una sola vez, manual): Proyecto.equipo guardaba el
// NOMBRE de cada persona en texto libre (elegido de un <select> alimentado
// por los mismos usuarios reales, pero sin guardar su id). Este script lo
// convierte a userId real para que el nuevo sistema de permisos por
// proyecto (ver src/lib/permisos.js) pueda comparar contra el usuario
// logueado. Es idempotente: si un valor ya es un id válido o ya es el
// sentinel "no_aplica", lo deja igual.
//
// Uso: cd server && node src/scripts/migrarEquipoAIds.js
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { EQUIPO_NO_APLICA, ROLES_EQUIPO } from '../lib/permisos.js'

async function main() {
  const usuarios = await prisma.user.findMany({ select: { id: true, nombre: true } })
  const idPorNombre = new Map(usuarios.map((u) => [u.nombre, u.id]))
  const idsValidos = new Set(usuarios.map((u) => u.id))

  const proyectos = await prisma.proyecto.findMany({ select: { id: true, slug: true, equipo: true } })

  let actualizados = 0
  const sinResolver = []

  for (const p of proyectos) {
    const equipoActual = p.equipo || {}
    const equipoNuevo = {}
    let cambio = false

    for (const rol of ROLES_EQUIPO) {
      const valor = equipoActual[rol]

      if (!valor || valor === EQUIPO_NO_APLICA || idsValidos.has(valor)) {
        equipoNuevo[rol] = valor ?? null
        continue
      }

      const idResuelto = idPorNombre.get(valor)
      if (idResuelto) {
        equipoNuevo[rol] = idResuelto
        cambio = true
      } else {
        equipoNuevo[rol] = null
        cambio = true
        sinResolver.push({ proyecto: p.slug, rol, valorOriginal: valor })
      }
    }

    if (cambio) {
      await prisma.proyecto.update({ where: { id: p.id }, data: { equipo: equipoNuevo } })
      actualizados++
      console.log(`  ✓ ${p.slug} actualizado`)
    }
  }

  console.log(`\nProyectos revisados: ${proyectos.length}`)
  console.log(`Proyectos actualizados: ${actualizados}`)

  if (sinResolver.length) {
    console.log(`\n⚠ ${sinResolver.length} rol(es) quedaron sin resolver (se dejaron en null) — corregir desde "Editar equipo" en el detalle del proyecto:`)
    sinResolver.forEach(({ proyecto, rol, valorOriginal }) => {
      console.log(`  - ${proyecto} · ${rol}: "${valorOriginal}" no coincide con ningún usuario activo`)
    })
  } else {
    console.log('\nTodos los roles se resolvieron correctamente.')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
