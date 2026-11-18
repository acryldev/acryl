import { render, useState } from 'acrylblends/jsx/dom'

const Counter = () => {
  const [count, setCount] = useState(0)
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Count {count}
    </button>
  )
}

render(<Counter />, document.getElementById('counter')!)
