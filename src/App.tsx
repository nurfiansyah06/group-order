import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import './App.css'

type Person = {
  id: string
  name: string
}

type Item = {
  id: string
  name: string
  cents: number
  people: string[]
}

type Bill = {
  title: string
  currency: string
  people: Person[]
  items: Item[]
  tax: string
  tip: string
}

const empty: Bill = {
  title: '',
  currency: 'IDR',
  people: [],
  items: [],
  tax: '0',
  tip: '0',
}

const key = 'table-tab-bill-v1'
const cents = (value: string) => Math.round(Number(value) * 100)

function validBill(value: unknown): value is Bill {
  if (!value || typeof value !== 'object') return false
  const b = value as Bill
  return typeof b.title === 'string' && ['USD', 'EUR', 'GBP', 'IDR'].includes(b.currency)
    && typeof b.tax === 'string' && Number.isFinite(Number(b.tax)) && Number(b.tax) >= 0 && Number(b.tax) <= 100
    && typeof b.tip === 'string' && Number.isFinite(Number(b.tip)) && Number(b.tip) >= 0 && Number(b.tip) <= 100
    && Array.isArray(b.people) && b.people.every(p => typeof p.id === 'string' && typeof p.name === 'string')
    && new Set(b.people.map(p => p.id)).size === b.people.length
    && Array.isArray(b.items) && b.items.every(i => typeof i.id === 'string' && typeof i.name === 'string' && Number.isSafeInteger(i.cents) && i.cents > 0
      && Array.isArray(i.people) && i.people.length > 0 && new Set(i.people).size === i.people.length && i.people.every(id => b.people.some(p => p.id === id)))
}

function calculate(bill: Bill) {
  const subtotal = bill.items.reduce((sum, item) => sum + item.cents, 0)
  const tax = Math.round(subtotal * Number(bill.tax) / 100)
  const tip = Math.round(subtotal * Number(bill.tip) / 100)
  const total = subtotal + tax + tip
  const shares = bill.people.map(person => ({
    ...person,
    base: bill.items.reduce((sum, item) => {
      const index = item.people.indexOf(person.id)
      return sum + (index < 0 ? 0 : Math.floor(item.cents / item.people.length) + (index < item.cents % item.people.length ? 1 : 0))
    }, 0),
    total: 0,
  }))
  if (subtotal) {
    shares.forEach(p => { p.total = Math.floor(total * p.base / subtotal) })
    const ranked = [...shares].sort((a, b) => (total * b.base % subtotal) - (total * a.base % subtotal))
    const remainder = total - shares.reduce((sum, p) => sum + p.total, 0)
    for (let i = 0; i < remainder; i++) ranked[i].total++
  }
  return { subtotal, tax, tip, total, shares }
}

function App() {
  const [bill, setBill] = useState<Bill>(empty)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [itemName, setItemName] = useState('')
  const [amount, setAmount] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
    if (!active) return
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (!validBill(parsed)) throw new Error('Invalid bill')
        setBill(parsed)
      }
    } catch { setError('Your saved bill could not be loaded. You can start a new bill below.') }
    setLoaded(true)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(key, JSON.stringify(bill)) }
    catch { queueMicrotask(() => setError('This browser could not save your bill. Keep this tab open and copy the summary before leaving.')) }
  }, [bill, loaded])
  const result = calculate(bill)
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: bill.currency }).format(value / 100)
  function addPerson(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    if (bill.people.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      setNotice('That name is already at the table. Add an initial to tell people apart.')
      return
    }
    const id = crypto.randomUUID()
    setBill({ ...bill, people: [...bill.people, { id, name: name.trim() }] })
    setSelected([...selected, id])
    setName('')
    setNotice('')
  }
  function addItem(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const price = cents(amount)
    if (!itemName.trim() || !Number.isSafeInteger(price) || price <= 0 || price > 100000000 || !selected.length) {
      setNotice('Enter an item, an amount between 0.01 and 1,000,000, and choose who shared it.')
      return
    }
    setBill({ ...bill, items: [...bill.items, { id: crypto.randomUUID(), name: itemName.trim(), cents: price, people: selected }] })
    setItemName('')
    setAmount('')
    setNotice('Item added to the receipt.')
  }
  async function copySummary() {
    const text = `${bill.title || 'Our table'}\n${bill.items.map(i => `${i.name}: ${money(i.cents)}`).join('\n')}\nTax: ${money(result.tax)}\nTip: ${money(result.tip)}\nTotal: ${money(result.total)}\n\n${result.shares.map(p => `${p.name}: ${money(p.total)}`).join('\n')}`
    try { await navigator.clipboard.writeText(text); setNotice('Summary copied. Paste it into your group chat.') }
    catch { setNotice('Clipboard access was blocked. Use Print receipt to save or share a PDF instead.') }
  }
  if (!loaded) return <main className="loading" role="status">Opening your table…</main>
  return (
    <>
      <header className="masthead">
        <span className="wordmark">
          table tab<span aria-hidden="true">.</span>
        </span>
        <span className="header-note">Good food. Fair shares.</span>
      </header>
      <main>
        <section className="intro">
          <div>
            <h1>
              Share the meal.<br />
              <em>Not the math.</em>
            </h1>
            <p>Everyone gets their fair share. Right down to the last cent.</p>
          </div>
          <p className="paper-note">
            A little less<br />
            “who had what?”
          </p>
        </section>
        {error && (
          <div className="error" role="alert">
            {error} <button onClick={() => setError('')}>Dismiss</button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">{error}</p>
        )}
        <div className="workspace">
          <div className="editor">
            <section className="section">
              <div className="section-heading">
                <span className="step">01</span>
                <h2>Set the table</h2>
              </div>
              <div className="details">
                <label>
                  Bill name
                  <input
                    maxLength={80}
                    placeholder="Give this meal a name"
                    value={bill.title}
                    onChange={e => setBill({ ...bill, title: e.target.value })}
                  />
                </label>
                <label>
                  Currency
                  <select
                    value={bill.currency}
                    onChange={e => setBill({ ...bill, currency: e.target.value })}
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                    <option>IDR</option>
                  </select>
                </label>
              </div>
              <form className="inline-form" onSubmit={addPerson}>
                <label>
                  Who's joining?
                  <input
                    required
                    maxLength={40}
                    placeholder="Person’s name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </label>
                <button className="secondary" type="submit">Add person</button>
              </form>
              <div className="people-list">
                {bill.people.map(p => (
                  <span className="person" key={p.id}>
                    {p.name}
                    <button
                      aria-label={`Remove ${p.name}`}
                      onClick={() => {
                        const affected = bill.items.filter(i => i.people.includes(p.id))
                        const exclusive = affected.filter(i => i.people.length === 1)
                        if (affected.length && !window.confirm(`Remove ${p.name}? Shared items will be split between the remaining people.${exclusive.length ? ` ${exclusive.length} item(s) assigned only to ${p.name} will also be deleted: ${exclusive.map(i => i.name).join(', ')}.` : ''}`)) return
                        setBill({
                          ...bill,
                          people: bill.people.filter(x => x.id !== p.id),
                          items: bill.items.map(i => ({ ...i, people: i.people.filter(id => id !== p.id) })).filter(i => i.people.length > 0),
                        })
                        setSelected(selected.filter(id => id !== p.id))
                        setNotice(`${p.name} removed. The receipt and everyone’s totals have been updated.`)
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {!bill.people.length && (
                <p className="hint">An empty table for now. Add your first person above.</p>
              )}
            </section>
            <section className="section">
              <div className="section-heading">
                <span className="step">02</span>
                <h2>What did you order?</h2>
              </div>
              <form onSubmit={addItem}>
                <div className="item-fields">
                  <label>
                    Item name
                    <input
                      required
                      maxLength={80}
                      placeholder="What’s on the bill?"
                      value={itemName}
                      onChange={e => setItemName(e.target.value)}
                    />
                  </label>
                  <label>
                    Amount
                    <input
                      required
                      type="number"
                      inputMode="decimal"
                      min=".01"
                      max="1000000"
                      step=".01"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                  </label>
                </div>
                <fieldset>
                  <legend>Who shared this item?</legend>
                  {bill.people.length ? (
                    <div className="choices">
                      {bill.people.map(p => (
                        <label className="choice" key={p.id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(p.id)}
                            onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))}
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">Add people first, then choose who ate what.</p>
                  )}
                </fieldset>
                <button className="primary" disabled={!bill.people.length}>
                  Add to receipt <span aria-hidden="true">+</span>
                </button>
              </form>
            </section>
            <section className="section extras">
              <div className="section-heading">
                <span className="step">03</span>
                <h2>The little extras</h2>
              </div>
              <div className="details">
                {(['tax', 'tip'] as const).map(field => (
                  <label key={field}>
                    {field === 'tax' ? 'Tax (%)' : 'Tip (%)'}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step=".01"
                      value={bill[field]}
                      onChange={e => {
                        const value = e.target.value
                        if (Number(value) >= 0 && Number(value) <= 100) setBill({ ...bill, [field]: value })
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="hint">Both apply to the subtotal and are shared in proportion to each person’s items.</p>
            </section>
          </div>
          <aside className="receipt" aria-label="Live bill summary">
            <div className="receipt-heading">
              <p className="receipt-brand">THE TABLE TAB</p>
              <h2>{bill.title || 'Our table'}</h2>
              <p>{bill.people.length} {bill.people.length === 1 ? 'person' : 'people'} · {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}</p>
            </div>
            <div className="receipt-items">
              {!bill.items.length ? (
                <div className="receipt-empty">
                  <span aria-hidden="true">[ &nbsp; ]</span>
                  <p>
                    A good meal starts<br />
                    with a blank receipt.
                  </p>
                  <small>
                    Add your items on the left.<br />
                    On a phone? They’re just above.
                  </small>
                </div>
              ) : bill.items.map(i => (
                <div className="receipt-item" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>{i.people.map(id => bill.people.find(p => p.id === id)?.name).join(', ')}</small>
                  </div>
                  <span>{money(i.cents)}</span>
                  <button
                    aria-label={`Remove item ${i.name}`}
                    onClick={() => setBill({ ...bill, items: bill.items.filter(x => x.id !== i.id) })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="totals">
              <div>
                <span>Subtotal</span>
                <span>{money(result.subtotal)}</span>
              </div>
              <div>
                <span>Tax ({bill.tax || 0}%)</span>
                <span>{money(result.tax)}</span>
              </div>
              <div>
                <span>Tip ({bill.tip || 0}%)</span>
                <span>{money(result.tip)}</span>
              </div>
              <div className="grand-total">
                <span>The total</span>
                <strong>{money(result.total)}</strong>
              </div>
            </div>
            <div className="shares">
              <h3>To each their own</h3>
              {result.shares.length ? result.shares.map(p => (
                <div className="share" key={p.id}>
                  <span>{p.name}</span>
                  <strong>{money(p.total)}</strong>
                </div>
              )) : (
                <p className="hint">Your table’s shares will appear here.</p>
              )}
            </div>
            <p className="receipt-footer">
              Thanks for keeping it fair.<br />
              See you at the next meal.
            </p>
            <div className="receipt-actions">
              <button className="primary" disabled={!bill.items.length} onClick={copySummary}>
                Copy summary
              </button>
              <button className="text-button" disabled={!bill.items.length} onClick={() => window.print()}>
                Print receipt
              </button>
            </div>
          </aside>
        </div>
        <p className="notice" role="status">{notice}</p>
      </main>
      <footer className="page-footer">
        <p>Saved in this browser. No accounts, no actual payments.</p>
        <button
          className="text-button"
          onClick={() => {
            if (window.confirm('Clear this bill and start a new table?')) {
              setBill(empty)
              setSelected([])
              setNotice('New table, blank receipt.')
            }
          }}
        >
          Start a new bill
        </button>
      </footer>
    </>
  )
}

export default App
