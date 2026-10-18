import { useParams } from 'react-router'

/**
 * TEMPORARY stand-in that proves the route tree resolves. Each usage is
 * replaced by the real (lazy-loaded) feature page in its feature phase.
 */
export function RoutePlaceholder({ title }: { title: string }) {
  const params = useParams()
  const entries = Object.entries(params)

  return (
    <section className="mx-auto w-full max-w-(--content-max-width) p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      {entries.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
