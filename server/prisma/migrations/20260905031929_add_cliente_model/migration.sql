-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "clienteId" TEXT;

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "contactoNombre" TEXT,
    "correo" TEXT,
    "whatsapp" TEXT,
    "participantes" JSONB NOT NULL DEFAULT '[]',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
