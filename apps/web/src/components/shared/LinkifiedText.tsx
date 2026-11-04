import { Fragment, memo } from 'react'

import { linkify } from '@/lib/linkify'

/**
 * Plain text with clickable http(s) links. Built from React elements only —
 * user content never goes through innerHTML.
 */
function LinkifiedTextImpl({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, index) =>
        'href' in part ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-primary underline underline-offset-2 hover:no-underline"
          >
            {part.href}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

export const LinkifiedText = memo(LinkifiedTextImpl)
