-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "crmId" TEXT;

-- AlterTable
ALTER TABLE "sitios"
ADD COLUMN "dominio" TEXT,
ADD COLUMN "infraestructura" TEXT NOT NULL DEFAULT 'sin_localizar',
ADD COLUMN "enhancedSiteId" TEXT,
ADD COLUMN "enhancedServerId" TEXT,
ADD COLUMN "cloudflareZoneId" TEXT;

-- CreateTable
CREATE TABLE "incidencias" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "clienteId" TEXT NOT NULL,
    "sitioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'todo',
    "prioridad" TEXT NOT NULL DEFAULT 'normal',
    "cobertura" TEXT NOT NULL DEFAULT 'por_valorar',
    "infraestructura" TEXT NOT NULL DEFAULT 'sin_localizar',
    "origen" TEXT NOT NULL DEFAULT 'interno',
    "tipo" TEXT NOT NULL DEFAULT 'falla',
    "responsableId" TEXT,
    "reportadoPor" TEXT,
    "telefonoOrigen" TEXT,
    "fechaLimite" TIMESTAMP(3),
    "diagnostico" TEXT NOT NULL DEFAULT '',
    "resolucion" TEXT NOT NULL DEFAULT '',
    "causaRaiz" TEXT NOT NULL DEFAULT '',
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "iniciadoEn" TIMESTAMP(3),
    "resueltoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_crmId_key" ON "clientes"("crmId");
CREATE UNIQUE INDEX "sitios_dominio_key" ON "sitios"("dominio");
CREATE UNIQUE INDEX "incidencias_folio_key" ON "incidencias"("folio");
CREATE INDEX "incidencias_estado_prioridad_creadoEn_idx" ON "incidencias"("estado", "prioridad", "creadoEn");
CREATE INDEX "incidencias_clienteId_idx" ON "incidencias"("clienteId");
CREATE INDEX "incidencias_sitioId_idx" ON "incidencias"("sitioId");

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_sitioId_fkey" FOREIGN KEY ("sitioId") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
