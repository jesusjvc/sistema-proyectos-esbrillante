export default function Avatar({ nombre, avatarUrl, size = 32, className = '' }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nombre || 'Avatar'}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-800 dark:text-brand-300 font-semibold flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {nombre ? nombre[0].toUpperCase() : '?'}
    </div>
  )
}
