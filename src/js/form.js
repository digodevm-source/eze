/**
 * Contact form: phone mask, validation and submission.
 * Set data-endpoint on the form (or window.GGD_FORM_ENDPOINT) to POST the
 * request as JSON to your backend / CRM webhook; without an endpoint the form
 * only shows the confirmation (useful for the demo).
 */
export function initForm() {
  const form = document.querySelector('[data-form]')
  if (!form) return
  const phone = form.querySelector('[data-phone]')
  const done = form.querySelector('[data-form-done]')
  const btn = form.querySelector('[type="submit"]')

  phone?.addEventListener('input', (e) => {
    let d = phone.value.replace(/\D/g, '')
    // deleting: let the user erase the mask's own characters, otherwise the
    // closing bracket or hyphen grows back and the number can't be cleared
    if (e.inputType?.startsWith('delete')) {
      if (d.length <= 1) phone.value = ''
      return
    }
    if (!d) return
    if (d.startsWith('8')) d = '7' + d.slice(1)
    if (!d.startsWith('7')) d = '7' + d
    d = d.slice(0, 11)
    const p = d.slice(1)
    let s = '+7'
    if (p.length) s += ' (' + p.slice(0, 3)
    if (p.length >= 3) s += ')'
    if (p.length > 3) s += ' ' + p.slice(3, 6)
    if (p.length > 6) s += '-' + p.slice(6, 8)
    if (p.length > 8) s += '-' + p.slice(8, 10)
    phone.value = s
  })

  const fieldOf = (el) => el.closest('.form__field, .check')

  const validate = () => {
    let ok = true
    const name = form.elements.name
    const tel = form.elements.phone
    const consent = form.elements.consent
    const set = (el, bad) => {
      fieldOf(el)?.classList.toggle('is-invalid', bad)
      if (bad) ok = false
    }
    set(name, name.value.trim().length < 2)
    set(tel, tel.value.replace(/\D/g, '').length !== 11)
    set(consent, !consent.checked)
    return ok
  }

  form.addEventListener('input', (e) => {
    const f = fieldOf(e.target)
    if (f?.classList.contains('is-invalid')) validate()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!validate()) {
      form.querySelector('.is-invalid input')?.focus()
      return
    }
    const data = Object.fromEntries(new FormData(form))
    const endpoint = form.dataset.endpoint || window.GGD_FORM_ENDPOINT
    btn.classList.add('is-sending')
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, page: location.href }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } else {
        await new Promise((r) => setTimeout(r, 700))
      }
      done.hidden = false
      form.reset()
    } catch {
      btn.querySelector('span').textContent = 'Не удалось отправить — позвоните нам'
    } finally {
      btn.classList.remove('is-sending')
    }
  })
}
