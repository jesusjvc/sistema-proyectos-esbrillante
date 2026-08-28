// Migración de datos (una sola vez, manual): el catálogo de plantillas vivía
// enteramente en localStorage del navegador del admin (src/data/plantillas.js),
// invisible para el backend y por tanto para el MCP. Este script lo migra a
// los nuevos modelos Plantilla/TareaPlantilla.
//
// Aprovecha la migración para corregir un bug preexistente: seedPlantillas()
// arma cada plantilla builtin clonando tareasWebBase() y reasignando un id
// nuevo a cada tarea (`uid()`) SIN remapear sus `dependencias`, que seguían
// apuntando a los ids originales de tareasWebBase() — es decir, en el sistema
// actual (localStorage) las dependencias entre tareas de las plantillas
// builtin ya estaban rotas (se descartaban en silencio al copiar a un
// proyecto, ver copiarTareasDesde). Aquí se reconstruyen bien: por cada
// plantilla se toma tareasWebBase() fresco y se remapea con su propio idMap.
//
// Uso: cd server && node src/scripts/migrarPlantillasABD.js
import 'dotenv/config'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import { tareasWebBase, FASES_WEB } from '../../../src/data/plantillasSeedData.js'

const PLANTILLAS_WEB = [
  { nombre: 'Web en Corto', descripcion: 'Sitio web básico, pocas secciones, entrega rápida.' },
  { nombre: 'Web Profesional', descripcion: 'Sitio web completo con diseño personalizado y SEO básico.' },
  { nombre: 'Web Corporativa', descripcion: 'Sitio web para empresa mediana con múltiples páginas y secciones.' },
  { nombre: 'Web Industrial', descripcion: 'Sitio web para empresa industrial con catálogo de productos o servicios.' },
  { nombre: 'Web Experto', descripcion: 'Sitio web avanzado con SEO profundo, blog y estrategia de contenido.' },
  { nombre: 'Ecommerce', descripcion: 'Tienda en línea con catálogo de productos y pasarela de pago.' },
]

async function crearPlantillaConTareasBase(nombre, area, descripcion) {
  const tareas = tareasWebBase()
  const idMap = {}
  tareas.forEach((t) => { idMap[t.id] = randomUUID() })

  await prisma.plantilla.create({
    data: {
      nombre,
      area,
      descripcion,
      fases: FASES_WEB,
      tareas: {
        create: tareas.map((t, idx) => ({
          id: idMap[t.id],
          fase: t.fase,
          orden: idx,
          titulo: t.titulo,
          responsable: t.responsable,
          dependencias: (t.dependencias || []).filter((d) => idMap[d]).map((d) => idMap[d]),
          condicion: t.condicion || null,
          descripcion: t.descripcion || '',
          queHacer: t.queHacer || '',
          necesitasAntes: t.necesitasAntes || '',
          plantillaMensaje: t.plantillaMensaje || '',
          queEntregas: t.queEntregas || '',
          linkTipo: t.linkTipo || null,
          esCliente: t.esCliente || false,
          instruccionesCliente: t.instruccionesCliente || '',
          plazoHoras: t.plazoHoras || null,
          esRutaCritica: t.esRutaCritica || false,
          soloAdmin: t.soloAdmin || false,
          soloKarlaOAdmin: t.soloKarlaOAdmin || false,
          opcional: t.opcional || false,
        })),
      },
    },
  })
  console.log(`  ✓ ${nombre} (${tareas.length} tareas)`)
}

async function main() {
  const existentes = await prisma.plantilla.count()
  if (existentes > 0) {
    console.log(`Ya hay ${existentes} plantilla(s) en la base de datos — no se vuelve a sembrar (script pensado para correr una sola vez).`)
    return
  }

  console.log('Creando plantillas builtin...')
  for (const { nombre, descripcion } of PLANTILLAS_WEB) {
    await crearPlantillaConTareasBase(nombre, 'Web', descripcion)
  }

  await prisma.plantilla.create({
    data: { nombre: 'Personalizado', area: 'General', descripcion: 'Plantilla vacía. El Admin construye el checklist manualmente.', fases: FASES_WEB },
  })
  console.log('  ✓ Personalizado (0 tareas)')

  console.log('\nMigración completada.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
