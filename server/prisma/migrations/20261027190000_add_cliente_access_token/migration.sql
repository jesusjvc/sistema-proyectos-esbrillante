-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "clienteAccessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_clienteAccessToken_key" ON "proyectos"("clienteAccessToken");
