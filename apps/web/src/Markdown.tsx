import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content, compact = false }: { content: unknown; compact?: boolean }) {
  return <div className={`markdown ${compact ? "compact" : ""}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        input: ({ ...props }) => <input {...props} disabled/>,
        table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>
      }}
    >{String(content ?? "")}</ReactMarkdown>
  </div>;
}
