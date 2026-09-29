/**
 * DuckDuckGo HTML parser tests against a fixed fixture (no network).
 */
import { describe, expect, it } from 'vitest'
import { normalizeDDGUrl, parseDDG, parseDDGLite } from '../agent/src/tools/webSearch'

const FIXTURE = `<!doctype html><html><body>
<div class="result">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=abc123">Example A &amp; Co</a></h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">First &#x27;snippet&#x27; &amp; more &quot;text&quot;</a>
</div>
<div class="result">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://example.org/b">Second Result</a></h2>
  <a class="result__snippet" href="https://example.org/b">Second snippet — نتیجه دوم</a>
</div>
<div class="result">
  <h2 class="result__title"><a class="result__a" href="https://example.net/c">Third&nbsp;Result</a></h2>
  <a class="result__snippet" href="https://example.net/c">Third snippet &lt;tag&gt; &#1662;</a>
</div>
</body></html>`

describe('parseDDG', () => {
  it('parses 3 results with uddg-wrapped links decoded and entities resolved', () => {
    const results = parseDDG(FIXTURE)
    expect(results).toHaveLength(3)
    expect(results[0]).toEqual({
      title: 'Example A & Co',
      url: 'https://example.com/a',
      snippet: "First 'snippet' & more \"text\"",
    })
    expect(results[1]).toEqual({
      title: 'Second Result',
      url: 'https://example.org/b',
      snippet: 'Second snippet — نتیجه دوم',
    })
    expect(results[2].title).toBe('Third Result')
    expect(results[2].snippet).toBe('Third snippet <tag> پ')
  })

  it('respects the max limit', () => {
    expect(parseDDG(FIXTURE, 2)).toHaveLength(2)
  })

  it('returns an empty list for unrelated html', () => {
    expect(parseDDG('<html><body><p>nothing here</p></body></html>')).toEqual([])
  })
})

describe('normalizeDDGUrl', () => {
  it('decodes uddg redirect links', () => {
    expect(normalizeDDGUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=abc')).toBe('https://example.com/a')
  })
  it('passes plain https links through', () => {
    expect(normalizeDDGUrl('https://example.org/b')).toBe('https://example.org/b')
  })
})

describe('parseDDGLite', () => {
  it('parses lite-mode rows', () => {
    const lite = `<html><body><table>
<tr><td><a rel="nofollow" href="https://example.dev/x">Lite &amp; Co</a></td></tr>
<tr><td class="result-snippet">lite snippet &amp; more</td></tr>
</table></body></html>`
    const results = parseDDGLite(lite)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Lite & Co')
    expect(results[0].url).toBe('https://example.dev/x')
    expect(results[0].snippet).toBe('lite snippet & more')
  })
})
