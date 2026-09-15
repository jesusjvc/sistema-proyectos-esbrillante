-- CreateTable
CREATE TABLE "sitios" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT,
    "hostingProveedor" TEXT,
    "dnsProveedor" TEXT,
    "tipoInstalacion" TEXT,
    "driveFolderUrl" TEXT,
    "contactoTecnico" TEXT,
    "coberturaMantenimiento" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sitios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sitios" ADD CONSTRAINT "sitios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
