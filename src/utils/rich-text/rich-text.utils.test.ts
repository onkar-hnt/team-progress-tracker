import { describe, expect, it } from 'vitest'

import {
  cleanPastedRichText,
  isRichTextEmpty,
  normaliseRichText,
  richTextToPlainText,
  toEditorContent,
} from './rich-text.utils'

describe('reading a description as words', () => {
  it('drops the markup and keeps a line per block', () => {
    expect(richTextToPlainText('<p>Built the form</p><p>Wired the save</p>')).toBe(
      'Built the form\nWired the save',
    )

    expect(richTextToPlainText('<ul><li>form</li><li>tests</li></ul>')).toBe('form\ntests')
  })

  it('leaves text written before the editor existed as it was', () => {
    expect(richTextToPlainText('Built the form.\nWired the save.')).toBe(
      'Built the form.\nWired the save.',
    )
  })

  it('reads the characters behind an entity', () => {
    expect(richTextToPlainText('<p>Smith &amp; Sons&nbsp;&#8212; done</p>')).toBe(
      'Smith & Sons — done',
    )
  })

  it('counts an untouched editor as nothing written', () => {
    expect(isRichTextEmpty('<p></p>')).toBe(true)
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
    expect(isRichTextEmpty('<p>&nbsp;</p>')).toBe(true)
    expect(isRichTextEmpty('')).toBe(true)
    expect(isRichTextEmpty('<p>Wired the save</p>')).toBe(false)
  })
})

describe('storing what the editor reports', () => {
  it('drops the empty paragraph the editor keeps below a list', () => {
    expect(normaliseRichText('<ul><li><p>form</p></li></ul><p></p>')).toBe(
      '<ul><li><p>form</p></li></ul>',
    )

    expect(normaliseRichText('<p><br></p><p>Wired the save</p><p>&nbsp;</p>')).toBe(
      '<p>Wired the save</p>',
    )
  })

  it('stores nothing for an editor that was emptied', () => {
    expect(normaliseRichText('<p></p>')).toBe('')
    expect(normaliseRichText('<p><br></p>')).toBe('')
  })

  it('keeps an empty line between two written ones', () => {
    expect(normaliseRichText('<p>Morning</p><p></p><p>Afternoon</p>')).toBe(
      '<p>Morning</p><p></p><p>Afternoon</p>',
    )
  })
})

describe('opening a stored description in the editor', () => {
  it('leaves formatted markup alone', () => {
    expect(toEditorContent('<ul><li>form</li></ul>')).toBe('<ul><li>form</li></ul>')
  })

  it('keeps the lines of an entry written before the editor existed', () => {
    expect(toEditorContent('Built the form.\nWired the save.')).toBe(
      '<p>Built the form.</p><p>Wired the save.</p>',
    )
  })

  it('describes a tag rather than carrying one', () => {
    expect(toEditorContent('used <script> in the page')).toBe(
      '<p>used &lt;script&gt; in the page</p>',
    )
  })
})

describe('taking in pasted content', () => {
  it('keeps the formatting a normal paste already carries', () => {
    const pasted = '<p>Built the <strong>form</strong> and <em>most</em> of the save</p>'

    expect(cleanPastedRichText(pasted)).toBe(pasted)
  })

  it('leaves the styles the editor reads formatting from', () => {
    // How Google Docs says bold, which the editor recognises itself.
    const pasted = '<p><span style="font-weight:700">Built the form</span></p>'

    expect(cleanPastedRichText(pasted)).toContain('font-weight:700')
  })

  it('drops scripts, styles and Office tags', () => {
    const pasted =
      '<style>p { color: red }</style><script>alert(1)</script><o:p></o:p><p>Built it</p>'

    expect(cleanPastedRichText(pasted)).toBe('<p>Built it</p>')
  })

  it('rebuilds a Word bullet list from the paragraphs it pastes as', () => {
    // Word pastes list items as paragraphs that name their level in the style
    // and draw the bullet themselves.
    const pasted = [
      `<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>`,
      `<!--[if !supportLists]--><span style='mso-list:Ignore'>·<span>&nbsp;</span></span><![endif]-->Built the form</p>`,
      `<p class=MsoListParagraph style='mso-list:l0 level2 lfo1'>`,
      `<!--[if !supportLists]--><span style='mso-list:Ignore'>o<span>&nbsp;</span></span><![endif]-->Validation still to do</p>`,
    ].join('')

    const cleaned = cleanPastedRichText(pasted)

    expect(cleaned).toContain('<ul>')
    expect(cleaned).not.toContain('mso-list')
    expect(richTextToPlainText(cleaned)).toBe('Built the form\nValidation still to do')

    // The second item is nested inside the first, not a sibling of it.
    expect(cleaned.indexOf('<ul><li>')).toBeLessThan(cleaned.indexOf('Built the form'))
    expect(cleaned).toMatch(/Built the form<ul><li>/u)
  })

  it('tells a numbered Word list from a bulleted one', () => {
    const pasted =
      `<p style='mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span><![endif]-->Review</p>` +
      `<p style='mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='mso-list:Ignore'>2.<span>&nbsp;</span></span><![endif]-->Merge</p>`

    const cleaned = cleanPastedRichText(pasted)

    expect(cleaned.startsWith('<ol>')).toBe(true)
    expect(richTextToPlainText(cleaned)).toBe('Review\nMerge')
  })

  it('keeps the text around a pasted list', () => {
    const pasted =
      `<p>Today:</p><p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·</span>Built the form</p><p>Tomorrow: the save</p>`

    expect(richTextToPlainText(cleanPastedRichText(pasted))).toBe(
      'Today:\nBuilt the form\nTomorrow: the save',
    )
  })
})
