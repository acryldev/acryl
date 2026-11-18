import { render, useEffect, useState } from 'acrylblends/jsx/dom'

/** The live character counter of the note form: a client component drawn next to the textarea, compiled on request by clientModules (see src/notes-app.ts). */
const Count = ({ area }: { area: HTMLTextAreaElement }) => {
  const [length, setLength] = useState(area.value.length)
  useEffect(() => {
    const update = () => setLength(area.value.length)
    area.addEventListener('input', update)
    return () => area.removeEventListener('input', update)
  }, [])
  return (
    <>
      {length} / {area.maxLength}
    </>
  )
}

const area = document.getElementById('body')
const out = document.querySelector('[data-island="counter"]')
if (area instanceof HTMLTextAreaElement && out instanceof HTMLElement)
  render(<Count area={area} />, out)
