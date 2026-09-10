import './PagePlaceholder.scss'

interface PagePlaceholderProps { description: string; title: string }

export function PagePlaceholder({ description, title }: PagePlaceholderProps) {
  return <section className="page-placeholder"><h1>{title}</h1><p>{description}</p></section>
}
