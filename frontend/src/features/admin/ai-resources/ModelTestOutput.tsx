import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Provider output is untrusted: no raw HTML, embedded images or active controls. */
export function ModelTestOutput({ children }: { children: string }) {
  return <div data-ui="model-test-output" className="max-h-72 min-h-32 min-w-0 overflow-auto break-words rounded-md bg-slate-50 p-3 text-sm leading-relaxed dark:bg-slate-900 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:my-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_h4]:font-semibold [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-200/60 [&_pre]:p-2 dark:[&_pre]:bg-slate-800 [&_code]:whitespace-pre-wrap [&_code]:font-mono [&_code]:text-xs [&_pre_code]:whitespace-pre [&_blockquote]:border-l-2 [&_blockquote]:border-slate-400 [&_blockquote]:pl-3 [&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img', 'input']} components={{
      a: ({ children, href }) => href && /^https?:\/\//i.test(href)
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline dark:text-blue-300">{children}</a>
        : <span>{children}</span>,
    }}>{children}</Markdown>
  </div>;
}
