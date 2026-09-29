-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "actorId" TEXT,
    "actorNombre" TEXT,
    "proyectoId" TEXT,
    "proyectoSlug" TEXT,
    "tareaId" TEXT,
    "tareaTitulo" TEXT,
    "comentarioId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_destinatarioId_leida_idx" ON "notificaciones"("destinatarioId", "leida");

-- CreateIndex
CREATE INDEX "notificaciones_creadaEn_idx" ON "notificaciones"("creadaEn");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
