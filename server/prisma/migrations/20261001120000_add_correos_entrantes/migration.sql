-- CreateTable
CREATE TABLE "correos_entrantes" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "nombreDe" TEXT,
    "asunto" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "fechaCorreo" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "notas" TEXT,
    "incidenciaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correos_entrantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "correos_entrantes_messageId_key" ON "correos_entrantes"("messageId");

-- CreateIndex
CREATE INDEX "correos_entrantes_incidenciaId_key" ON "correos_entrantes"("incidenciaId");

-- CreateIndex
CREATE INDEX "correos_entrantes_estado_creadoEn_idx" ON "correos_entrantes"("estado", "creadoEn");

-- AddForeignKey
ALTER TABLE "correos_entrantes" ADD CONSTRAINT "correos_entrantes_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "incidencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
