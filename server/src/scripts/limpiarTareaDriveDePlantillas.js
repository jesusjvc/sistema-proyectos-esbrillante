// Limpieza de datos (una sola vez, manual): la tarea "Crear carpeta en Google
// Drive" (w-f1-02 en plantillasSeedData.js) ya se quitó de la fuente, pero las
// plantillas ya estaban sembradas en la base desde migrarPlantillasABD.js y
// ese script no se vuelve a ejecutar. Este script borra esas filas ya
// existentes en TareaPlantilla para que los proyectos nuevos dejen de
// heredarla — la carpeta de Drive ya se crea sola al dar de alta el proyecto.
//
// Uso: cd server && node src/scripts/limpiarTareaDriveDePlantillas.js
import 'dotenv/config'
import prisma from '../lib/prisma.js'

const { count } = await prisma.tareaPlantilla.deleteMany({
  where: { titulo: 'Crear carpeta en Google Drive' },
})

console.log(`Eliminadas ${count} tareas "Crear carpeta en Google Drive" de las plantillas.`)
await prisma.$disconnect()
