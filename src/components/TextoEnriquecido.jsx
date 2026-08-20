import DOMPurify from 'dompurify'

const TAGS_PERMITIDOS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li']
const TIENE_HTML = /<[a-z][\s\S]*>/i

export default function TextoEnriquecido({ html, className = '' }) {
  if (!html) return null

  if (!TIENE_HTML.test(html)) {
    return <div className={`whitespace-pre-wrap ${className}`}>{html}</div>
  }

  const limpio = DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS_PERMITIDOS, ALLOWED_ATTR: [] })
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: limpio }} />
}
