-- CreateIndex
-- Evita que dos escritores concurrentes (widget, SSE, tool MCP) asignen el
-- mismo número dentro de un prototipo.
CREATE UNIQUE INDEX "anotaciones_prototipoId_numero_key" ON "anotaciones"("prototipoId", "numero");

-- AddCheckConstraint
-- Exactamente uno de html/urlExterna debe estar presente — Prisma no expresa
-- CHECK constraints de forma declarativa, se agrega a mano (ver review de la
-- tarea 1: R3-prototipo-html-url-unconstrained).
ALTER TABLE "prototipos" ADD CONSTRAINT "prototipos_html_o_url_externa_check"
  CHECK (
    (html IS NOT NULL AND "urlExterna" IS NULL) OR
    (html IS NULL AND "urlExterna" IS NOT NULL)
  );
