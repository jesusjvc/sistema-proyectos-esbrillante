import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg text-sm text-slate-800 focus-within:ring-2 focus-within:ring-brand-400 focus-within:border-transparent overflow-hidden'

function BotonToolbar({ activo, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${activo ? 'bg-brand-100 text-brand-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  )
}

export default function EditorEnriquecido({ value, onChange, placeholder, minHeight = '4.5rem' }) {
  // El contenido inicial se toma una sola vez: Tiptap administra el documento de ahí en
  // adelante, así que no debe re-sincronizarse con `value` en cada render (eso dispara
  // setOptions en cada tecleo y puede perder contenido bajo tecleo muy rápido).
  const [contenidoInicial] = useState(() => value || '')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: contenidoInicial,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })

  if (!editor) return null

  return (
    <div className={inputCls}>
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100 bg-slate-50">
        <BotonToolbar activo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
          <Bold size={14} />
        </BotonToolbar>
        <BotonToolbar activo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálica">
          <Italic size={14} />
        </BotonToolbar>
        <BotonToolbar activo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista con viñetas">
          <List size={14} />
        </BotonToolbar>
        <BotonToolbar activo={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <ListOrdered size={14} />
        </BotonToolbar>
      </div>
      <EditorContent editor={editor} className="rich-text px-3 py-2.5" style={{ minHeight }} />
    </div>
  )
}
