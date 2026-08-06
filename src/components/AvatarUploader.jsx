import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import Avatar from './Avatar'
import { archivoAAvatarDataUrl } from '../lib/image'
import { actualizarMiAvatar } from '../data/api'

export default function AvatarUploader({ user, onUpdated, size = 40 }) {
  const inputRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError('')
    setSubiendo(true)
    try {
      const dataUrl = await archivoAAvatarDataUrl(file)
      const actualizado = await actualizarMiAvatar(dataUrl)
      onUpdated(actualizado)
    } catch (err) {
      setError(err.message || 'No se pudo subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="relative inline-block shrink-0">
      <Avatar nombre={user?.nombre} avatarUrl={user?.avatarUrl} size={size} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        title="Cambiar foto de perfil"
        className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-500 hover:bg-brand-600 text-slate-900 rounded-full flex items-center justify-center border-2 border-slate-950 transition-colors"
      >
        {subiendo ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      {error && (
        <div className="absolute top-full left-0 mt-1 text-[10px] text-red-400 whitespace-nowrap z-10">{error}</div>
      )}
    </div>
  )
}
