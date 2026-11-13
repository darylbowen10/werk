import { go } from "./next-navigation";
export default function Link({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className} onClick={(e) => { e.preventDefault(); go(href); }}>{children}</a>;
}
