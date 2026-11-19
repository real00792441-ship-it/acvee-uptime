// Проверка доступности acveemarket.kz и админки (19.11.2026, решение владельца). Запускается GitHub Actions каждые 5 минут
// (.github/workflows/uptime.yml). Сайт упал или снова заработал — сообщение в Telegram. Тег Google не срабатывает: обычный fetch
// без браузера, JS страниц не выполняется. Пишет в Telegram только при смене состояния (упал / снова работает), не каждые 5 минут.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 acvee-uptime'
const SITE = 'https://acveemarket.kz'
const ADMIN = 'https://admin-five-self-44.vercel.app'
// [адрес, что должно быть в ответе] — страницы, куда ведёт реклама, и API, из которого сайт берёт каталог
const CHECKS = [
  [SITE + '/', 'AcveeMarket'],
  [SITE + '/catalog/tork', 'href="/product/'],
  [SITE + '/catalog/tork/tualetnaya-bumaga/dispensery', 'href="/product/'],
  [SITE + '/catalog/tork/bumazhnye-polotentsa-dlya-ruk/dispensery', 'href="/product/'],
  [SITE + '/catalog/tork/mylo/dispensery', 'href="/product/'],
  [SITE + '/catalog/moyushchie-sredstva/kukhnya', 'href="/product/'],
  [SITE + '/production', 'SONA lab'],
  [SITE + '/tork', 'Tork'],
  [ADMIN + '/api/public/sitemap', '"products"'],
]

async function check([url, needle]) {
  const t0 = Date.now()
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
      const body = await res.text()
      if (res.status === 200 && body.includes(needle)) return { url, ok: true, ms: Date.now() - t0 }
      if (attempt === 2) return { url, ok: false, why: res.status !== 200 ? `код ${res.status}` : 'страница пустая (нет ожидаемого содержимого)' }
    } catch (e) {
      if (attempt === 2) return { url, ok: false, why: e?.name === 'TimeoutError' ? 'нет ответа 20 с' : String(e?.message || e).slice(0, 120) }
    }
    await new Promise(r => setTimeout(r, 5000))   // одна повторная попытка через 5 с — разовый сбой сети не тревога
  }
}

// Итог предыдущего завершённого запуска: тревога только при переходе «работал → упал» и «упал → работает».
async function previousConclusion() {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId, GITHUB_TOKEN: token } = process.env
  if (!repo || !token) return null
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/uptime.yml/runs?status=completed&per_page=5`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
    const j = await res.json()
    const prev = (j.workflow_runs || []).find(r => String(r.id) !== String(runId) && (r.conclusion === 'success' || r.conclusion === 'failure'))
    return prev ? prev.conclusion : null
  } catch { return null }
}

async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env
  if (!token || !chat) { console.log('Telegram не настроен:', text); return }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) })
  if (!res.ok) console.log('Telegram ответил', res.status)
}

const results = await Promise.all(CHECKS.map(check))
for (const r of results) console.log(r.ok ? `ОК ${r.ms} мс` : `СБОЙ: ${r.why}`, r.url)
const failed = results.filter(r => !r.ok)
const prev = await previousConclusion()
const time = new Date().toLocaleString('ru', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
if (failed.length && prev !== 'failure') {
  await telegram(`Сайт AcveeMarket: сбой (${time} по Алматы)\n\n` + failed.map(f => `• ${f.url.replace('https://', '')} — ${f.why}`).join('\n') +
    '\n\nРеклама в это время может вести на ошибку. Проверьте Vercel (оплата, выкладка) и админку.')
} else if (!failed.length && prev === 'failure') {
  await telegram(`Сайт AcveeMarket снова работает (${time} по Алматы). Все ${results.length} проверок прошли.`)
}
process.exit(failed.length ? 1 : 0)
