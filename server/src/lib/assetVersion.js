// Cache-buster (?v=) para los <script> del widget de revisión de prototipos —
// express.static sirve /resources con max-age=0, que algunos navegadores no
// siempre respetan como "revalidar siempre" para un <script> ya en su caché
// de disco (confirmado en esbrillante-pages-mcp: tras un deploy, un
// visitante que ya había cargado la página seguía recibiendo el revision.js
// viejo pese a max-age=0). Cambia en cada arranque del proceso (cada deploy
// lo reinicia), así que invalida el caché de cualquier cliente que visite
// después, sin depender de que respete los headers de cache-control.
export const ASSET_VERSION = Date.now()
