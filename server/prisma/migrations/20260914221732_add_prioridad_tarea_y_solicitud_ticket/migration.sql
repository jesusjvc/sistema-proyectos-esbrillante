-- AlterTable
ALTER TABLE "tareas" ADD COLUMN     "prioridad" TEXT,
ADD COLUMN     "fechaLimite" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "solicitudes" ADD COLUMN     "tipo" TEXT,
ADD COLUMN     "cobertura" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'portal',
ADD COLUMN     "sitioId" TEXT,
ADD COLUMN     "clienteId" TEXT;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_sitioId_fkey" FOREIGN KEY ("sitioId") REFERENCES "sitios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
