import 'dotenv/config'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'

const usuarios = [
  {
    email: 'jesus@esbrillante.mx',
    password: 'cambiar123',
    nombre: 'Jesús',
    rol: 'ADMIN',
    esKarla: false,
  },
  {
    email: 'karla@esbrillante.mx',
    password: 'cambiar123',
    nombre: 'Karla',
    rol: 'EQUIPO',
    esKarla: true,
  },
]

async function main() {
  console.log('Seeding usuarios...')

  for (const u of usuarios) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    if (existing) {
      console.log(`  ↩ ${u.email} ya existe, se omite`)
      continue
    }

    const hash = await bcrypt.hash(u.password, 12)
    await prisma.user.create({
      data: { ...u, password: hash },
    })
    console.log(`  ✓ ${u.email} creado (${u.rol})`)
  }

  console.log('Seed completado.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
